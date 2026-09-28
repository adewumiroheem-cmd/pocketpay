import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL || '');
const ADMIN_USERNAME = process.env.POCKETPAY_ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.POCKETPAY_ADMIN_PASSWORD || '';

type Account = {
  id: string;
  username: string;
  username_key: string;
  password_hash: string;
  full_name: string;
  date_of_birth: string;
  email: string;
  phone: string;
  country: string;
  bio: string;
  avatar_data: string | null;
  balance: string | number;
  balance_updated_at: string | Date | null;
  created_at: string | Date;
};

function send(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

function bad(res: VercelResponse, message: string, status = 400) {
  return send(res, status, { error: message });
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string) {
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function isAdmin(username?: string, password?: string) {
  return Boolean(ADMIN_USERNAME && ADMIN_PASSWORD && username === ADMIN_USERNAME && password === ADMIN_PASSWORD);
}

function balanceValue(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function iso(value: string | Date | null | undefined, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function publicProfile(account: Account) {
  return {
    accountId: account.id,
    username: account.username,
    fullName: account.full_name,
    dateOfBirth: account.date_of_birth,
    email: account.email,
    phone: account.phone,
    country: account.country,
    bio: account.bio,
    avatarUrl: account.avatar_data || undefined,
  };
}

function adminAccountView(account: Account) {
  return {
    ...publicProfile(account),
    balance: balanceValue(account.balance),
    createdAt: iso(account.created_at),
  };
}

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar_data TEXT,
      balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      balance_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function findAccount(username: string) {
  const usernameKey = username.trim().toLowerCase();
  const rows = await sql<Account>`SELECT * FROM accounts WHERE username_key = ${usernameKey} LIMIT 1`;
  return rows[0] || null;
}

async function getAccountById(id: string) {
  const rows = await sql<Account>`SELECT * FROM accounts WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

async function requireAdmin(res: VercelResponse, username?: string, password?: string) {
  if (!isAdmin(username, password)) {
    send(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!process.env.DATABASE_URL) return bad(res, 'Database is not configured', 500);

  try {
    await ensureSchema();
    const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
    const body = (req.body || {}) as Record<string, any>;

    if (req.method === 'POST' && path === 'signup') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const usernameKey = username.toLowerCase();
      if (!username || !password || username.length < 3 || password.length < 4) return bad(res, 'Invalid signup details', 400);
      if (usernameKey === ADMIN_USERNAME.toLowerCase()) return bad(res, 'That username is reserved', 409);
      if (await findAccount(username)) return bad(res, 'Username already exists', 409);
      const id = randomUUID();
      const now = new Date().toISOString();
      await sql`
        INSERT INTO accounts (id, username, username_key, password_hash, balance_updated_at, created_at)
        VALUES (${id}, ${username}, ${usernameKey}, ${hashPassword(password)}, ${now}, ${now})
      `;
      return send(res, 200, { created: true, accountId: id });
    }

    if (req.method === 'POST' && path === 'login') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const account = username ? await findAccount(username) : null;
      if (!account || !verifyPassword(password, account.password_hash)) return bad(res, 'Unauthorized', 401);
      return send(res, 200, {
        authenticated: true,
        accountId: account.id,
        profile: publicProfile(account),
        wallet: {
          balance: balanceValue(account.balance),
          balanceUpdatedAt: iso(account.balance_updated_at, iso(account.created_at)),
          updatedAt: iso(account.balance_updated_at, iso(account.created_at)),
        },
      });
    }

    if (req.method === 'GET' && path === 'profile') {
      const username = String(url.searchParams.get('username') || '').trim();
      if (!username) return bad(res, 'Username is required');
      const account = await findAccount(username);
      if (!account) return bad(res, 'Account not found', 404);
      return send(res, 200, publicProfile(account));
    }

    if (req.method === 'PUT' && path === 'profile') {
      const username = String(body.username || '').trim();
      const account = username ? await findAccount(username) : null;
      if (!account) return bad(res, 'Account not found', 404);
      const avatarData = body.avatarBase64
        ? `data:${String(body.avatarContentType || 'image/jpeg')};base64,${String(body.avatarBase64)}`
        : account.avatar_data;
      await sql`
        UPDATE accounts SET
          full_name = ${String(body.fullName ?? '').trim().slice(0, 120)},
          date_of_birth = ${String(body.dateOfBirth ?? '')},
          email = ${String(body.email ?? '').trim().slice(0, 160)},
          phone = ${String(body.phone ?? '').trim().slice(0, 40)},
          country = ${String(body.country ?? '').trim().slice(0, 80)},
          bio = ${String(body.bio ?? '').trim().slice(0, 500)},
          avatar_data = ${avatarData}
        WHERE id = ${account.id}
      `;
      const updated = await getAccountById(account.id);
      return send(res, 200, publicProfile(updated!));
    }

    if (req.method === 'GET' && path === 'wallet') {
      const username = String(url.searchParams.get('username') || '').trim();
      if (!username) return bad(res, 'Username is required');
      const account = await findAccount(username);
      if (!account) return bad(res, 'Account not found', 404);
      const updatedAt = iso(account.balance_updated_at, iso(account.created_at));
      return send(res, 200, { balance: balanceValue(account.balance), balanceUpdatedAt: updatedAt, updatedAt });
    }

    if (req.method === 'PUT' && path === 'wallet/balance') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const amount = Number(body.balance);
      const account = username ? await findAccount(username) : null;
      if (!account || !verifyPassword(password, account.password_hash)) return bad(res, 'Unauthorized', 401);
      if (!Number.isFinite(amount) || amount < 0) return bad(res, 'Invalid balance');
      const next = Math.round(amount * 100) / 100;
      const now = new Date().toISOString();
      const rows = await sql<Account>`UPDATE accounts SET balance = ${next}, balance_updated_at = ${now} WHERE id = ${account.id} RETURNING balance, balance_updated_at`;
      const updated = rows[0];
      if (!updated) return bad(res, 'Could not update balance', 500);
      return send(res, 200, { balance: balanceValue(updated.balance), balanceUpdatedAt: iso(updated.balance_updated_at), updatedAt: iso(updated.balance_updated_at) });
    }

    if (req.method === 'POST' && path === 'wallet/action') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const action = body.action;
      const amount = Number(body.amount);
      const account = username ? await findAccount(username) : null;
      if (!account || !verifyPassword(password, account.password_hash)) return bad(res, 'Unauthorized', 401);
      const current = balanceValue(account.balance);
      if (action === 'more') return send(res, 200, { action, message: 'More account options are available in this fictional wallet.', balance: current });
      if (!['send', 'receive'].includes(action) || !Number.isFinite(amount) || amount <= 0) return bad(res, 'Enter a valid positive amount');
      const value = Math.round(amount * 100) / 100;
      const now = new Date().toISOString();
      let rows: Account[] = [];
      if (action === 'send') {
        rows = await sql<Account>`UPDATE accounts SET balance = balance - ${value}, balance_updated_at = ${now} WHERE id = ${account.id} AND balance >= ${value} RETURNING balance, balance_updated_at`;
        if (!rows[0]) return bad(res, 'Insufficient fictional wallet balance', 400);
      } else {
        rows = await sql<Account>`UPDATE accounts SET balance = balance + ${value}, balance_updated_at = ${now} WHERE id = ${account.id} RETURNING balance, balance_updated_at`;
      }
      return send(res, 200, {
        action,
        message: action === 'send' ? `Simulated send of ${value.toFixed(2)} completed.` : `Simulated receipt of ${value.toFixed(2)} completed.`,
        balance: balanceValue(rows[0].balance),
        balanceUpdatedAt: iso(rows[0].balance_updated_at),
        updatedAt: iso(rows[0].balance_updated_at),
      });
    }

    if (req.method === 'POST' && path === 'admin/login') {
      if (!isAdmin(body.username, body.password)) return bad(res, 'Unauthorized', 401);
      return send(res, 200, { authenticated: true });
    }

    if (req.method === 'POST' && path === 'admin/accounts') {
      if (!(await requireAdmin(res, body.username, body.password))) return;
      const rows = await sql<Account>`SELECT * FROM accounts ORDER BY created_at DESC LIMIT 100`;
      return send(res, 200, { accounts: rows.map(adminAccountView) });
    }

    if (req.method === 'PUT' && path === 'admin/account-balance') {
      if (!(await requireAdmin(res, body.adminUsername, body.adminPassword))) return;
      const amount = Number(body.balance);
      if (!body.accountId) return bad(res, 'Account ID is required');
      if (!Number.isFinite(amount) || amount < 0) return bad(res, 'Invalid balance');
      const account = await getAccountById(String(body.accountId));
      if (!account) return bad(res, 'Account not found', 404);
      const next = Math.round(amount * 100) / 100;
      const now = new Date().toISOString();
      const rows = await sql<Account>`UPDATE accounts SET balance = ${next}, balance_updated_at = ${now} WHERE id = ${account.id} RETURNING balance, balance_updated_at`;
      if (!rows[0]) return bad(res, 'Could not update balance', 500);
      return send(res, 200, { accountId: account.id, balance: balanceValue(rows[0].balance), balanceUpdatedAt: iso(rows[0].balance_updated_at), updatedAt: iso(rows[0].balance_updated_at) });
    }

    return bad(res, 'Not found', 404);
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Server error' });
  }
}
