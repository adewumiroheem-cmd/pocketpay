import { router, json, error, db, storage } from '@appdeploy/sdk';

type AccountRecord = {
  username: string;
  usernameKey: string;
  passwordHash: string;
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  country: string;
  bio: string;
  avatarPath?: string;
  balance: number;
  balanceUpdatedAt?: string;
  createdAt: string;
};

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'demo-1234';

const hashPassword = async (password: string) => {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const isAdmin = (username?: string, password?: string) =>
  username === ADMIN_USERNAME && password === ADMIN_PASSWORD;

const findAccount = async (username: string) => {
  const usernameKey = username.trim().toLowerCase();
  const keyed = await db.list<AccountRecord>('accounts', { filter: { usernameKey }, limit: 10 });
  if (keyed.items.length > 0) return keyed.items[0];
  const legacy = await db.list<AccountRecord>('accounts', { filter: { username }, limit: 10 });
  const exactLegacy = legacy.items.find(item => item.username.trim().toLowerCase() === usernameKey);
  return exactLegacy ?? null;
};

const getAccountById = async (accountId: string) => {
  const [account] = await db.get<AccountRecord>('accounts', [accountId]);
  return account ? { ...account, id: accountId } : null;
};

const publicProfile = async (account: AccountRecord & { id: string }) => {
  let avatarUrl: string | undefined;
  if (account.avatarPath) {
    const [signed] = await storage.url([account.avatarPath]);
    avatarUrl = signed?.url;
  }
  return {
    accountId: account.id,
    username: account.username,
    fullName: account.fullName,
    dateOfBirth: account.dateOfBirth,
    email: account.email,
    phone: account.phone,
    country: account.country,
    bio: account.bio,
    avatarUrl,
  };
};

const adminAccountView = async (account: AccountRecord & { id: string }) => ({
  ...(await publicProfile(account)),
  balance: Number.isFinite(account.balance) ? account.balance : 0,
  createdAt: account.createdAt,
});

export const handler = router({
  'POST /api/signup': [
    async ({ body }) => {
      const payload = body as { username?: string; password?: string };
      const username = payload.username?.trim();
      const password = payload.password;
      const usernameKey = username?.toLowerCase();
      if (!username || !password || username.length < 3 || password.length < 4 || !usernameKey) {
        return error('Invalid signup details', 400);
      }
      if (usernameKey === ADMIN_USERNAME) return error('That username is reserved', 409);
      if (await findAccount(username)) return error('Username already exists', 409);

      const passwordHash = await hashPassword(password);
      const [id] = await db.add('accounts', [{
        username,
        usernameKey,
        passwordHash,
        fullName: '',
        dateOfBirth: '',
        email: '',
        phone: '',
        country: '',
        bio: '',
        avatarPath: undefined,
        balance: 0,
        balanceUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }]);
      if (!id) return error('Could not create account', 500);
      return json({ created: true, accountId: id });
    },
  ],

  'POST /api/login': [
    async ({ body }) => {
      const payload = body as { username?: string; password?: string };
      const username = payload.username?.trim();
      const password = payload.password;
      if (!username || !password) return error('Unauthorized', 401);
      const account = await findAccount(username);
      if (!account || account.username.trim().toLowerCase() !== username.toLowerCase() || account.passwordHash !== await hashPassword(password)) {
        return error('Unauthorized', 401);
      }
      const balance = Number.isFinite(account.balance) ? account.balance : 0;
      return json({ authenticated: true, accountId: account.id, profile: await publicProfile(account), wallet: { balance, balanceUpdatedAt: account.balanceUpdatedAt ?? account.createdAt, updatedAt: account.balanceUpdatedAt ?? account.createdAt } });
    },
  ],

  'GET /api/profile': [
    async ({ query }) => {
      const username = query.username?.trim();
      if (!username) return error('Username is required', 400);
      const account = await findAccount(username);
      if (!account) return error('Account not found', 404);
      return json(await publicProfile(account));
    },
  ],

  'PUT /api/profile': [
    async ({ body }) => {
      const payload = body as {
        username?: string;
        fullName?: string;
        dateOfBirth?: string;
        email?: string;
        phone?: string;
        country?: string;
        bio?: string;
        avatarBase64?: string;
        avatarContentType?: string;
      };
      const username = payload.username?.trim();
      if (!username) return error('Username is required', 400);
      const account = await findAccount(username);
      if (!account) return error('Account not found', 404);

      let avatarPath = account.avatarPath;
      if (payload.avatarBase64) {
        const contentType = payload.avatarContentType?.startsWith('image/') ? payload.avatarContentType : 'image/jpeg';
        const extension = contentType.split('/')[1] || 'jpeg';
        avatarPath = `avatars/${account.id}.${extension}`;
        const [ok] = await storage.write([{ path: avatarPath, content: payload.avatarBase64, contentType }]);
        if (!ok) return error('Could not save profile picture', 500);
      }

      const nextRecord: AccountRecord = {
        ...account,
        fullName: (payload.fullName ?? '').trim().slice(0, 120),
        dateOfBirth: payload.dateOfBirth ?? '',
        email: (payload.email ?? '').trim().slice(0, 160),
        phone: (payload.phone ?? '').trim().slice(0, 40),
        country: (payload.country ?? '').trim().slice(0, 80),
        bio: (payload.bio ?? '').trim().slice(0, 500),
        avatarPath,
        balance: Number.isFinite(account.balance) ? account.balance : 0,
        balanceUpdatedAt: account.balanceUpdatedAt,
      };
      const [updated] = await db.update('accounts', [{ id: account.id, record: nextRecord }]);
      if (!updated) return error('Could not save profile', 500);
      return json(await publicProfile({ ...nextRecord, id: account.id }));
    },
  ],

  'GET /api/wallet': [
    async ({ query }) => {
      const username = query.username?.trim();
      if (!username) return error('Username is required', 400);
      const account = await findAccount(username);
      if (!account) return error('Account not found', 404);
      return json({ balance: Number.isFinite(account.balance) ? account.balance : 0, balanceUpdatedAt: account.balanceUpdatedAt ?? account.createdAt, updatedAt: account.balanceUpdatedAt ?? account.createdAt });
    },
  ],

  'PUT /api/wallet/balance': [
    async ({ body }) => {
      const payload = body as { username?: string; password?: string; balance?: number };
      if (!payload.username || !payload.password) return error('Unauthorized', 401);
      const account = await findAccount(payload.username);
      if (!account || account.passwordHash !== await hashPassword(payload.password)) return error('Unauthorized', 401);
      if (typeof payload.balance !== 'number' || !Number.isFinite(payload.balance) || payload.balance < 0) return error('Invalid balance', 400);
      const next = Math.round(payload.balance * 100) / 100;
      const balanceUpdatedAt = new Date().toISOString();
      const [updated] = await db.update('accounts', [{ id: account.id, record: { ...account, balance: next, balanceUpdatedAt } }]);
      if (!updated) return error('Could not update balance', 500);
      return json({ balance: next, balanceUpdatedAt, updatedAt: balanceUpdatedAt });
    },
  ],

  'POST /api/wallet/action': [
    async ({ body }) => {
      const payload = body as { username?: string; password?: string; action?: 'send' | 'receive' | 'more'; amount?: number };
      if (!payload.username || !payload.password || !payload.action || !['send', 'receive', 'more'].includes(payload.action)) {
        return error('Invalid wallet action', 400);
      }
      const account = await findAccount(payload.username);
      if (!account || account.passwordHash !== await hashPassword(payload.password)) return error('Unauthorized', 401);
      const currentBalance = Number.isFinite(account.balance) ? account.balance : 0;
      if (payload.action === 'more') return json({ action: 'more', message: 'More account options are available in this fictional wallet.', balance: currentBalance });
      if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount) || payload.amount <= 0) return error('Enter a valid positive amount', 400);
      const amount = Math.round(payload.amount * 100) / 100;
      if (payload.action === 'send') {
        if (amount > currentBalance) return error('Insufficient fictional wallet balance', 400);
        const next = Math.round((currentBalance - amount) * 100) / 100;
        const balanceUpdatedAt = new Date().toISOString();
        const [updated] = await db.update('accounts', [{ id: account.id, record: { ...account, balance: next, balanceUpdatedAt } }]);
        if (!updated) return error('Could not update balance', 500);
        return json({ action: 'send', message: `Simulated send of ${amount.toFixed(2)} completed.`, balance: next, balanceUpdatedAt, updatedAt: balanceUpdatedAt });
      }
      const next = Math.round((currentBalance + amount) * 100) / 100;
      const balanceUpdatedAt = new Date().toISOString();
      const [updated] = await db.update('accounts', [{ id: account.id, record: { ...account, balance: next, balanceUpdatedAt } }]);
      if (!updated) return error('Could not update balance', 500);
      return json({ action: 'receive', message: `Simulated receipt of ${amount.toFixed(2)} completed.`, balance: next, balanceUpdatedAt, updatedAt: balanceUpdatedAt });
    },
  ],

  'POST /api/admin/login': [
    async ({ body }) => {
      const payload = body as { username?: string; password?: string };
      if (!isAdmin(payload.username, payload.password)) return error('Unauthorized', 401);
      return json({ authenticated: true });
    },
  ],

  'POST /api/admin/accounts': [
    async ({ body }) => {
      const payload = body as { username?: string; password?: string };
      if (!isAdmin(payload.username, payload.password)) return error('Unauthorized', 401);
      const result = await db.list<AccountRecord>('accounts', { limit: 100 });
      const accounts = await Promise.all(result.items.map(account => adminAccountView(account)));
      return json({ accounts });
    },
  ],

  'PUT /api/admin/account-balance': [
    async ({ body }) => {
      const payload = body as { adminUsername?: string; adminPassword?: string; accountId?: string; balance?: number };
      if (!isAdmin(payload.adminUsername, payload.adminPassword)) return error('Unauthorized', 401);
      if (!payload.accountId) return error('Account ID is required', 400);
      if (typeof payload.balance !== 'number' || !Number.isFinite(payload.balance) || payload.balance < 0) {
        return error('Invalid balance', 400);
      }
      const account = await getAccountById(payload.accountId);
      if (!account) return error('Account not found', 404);
      const next = Math.round(payload.balance * 100) / 100;
      const balanceUpdatedAt = new Date().toISOString();
      const [updated] = await db.update('accounts', [{ id: account.id, record: { ...account, balance: next, balanceUpdatedAt } }]);
      if (!updated) return error('Could not update balance', 500);
      return json({ accountId: account.id, balance: next, balanceUpdatedAt, updatedAt: balanceUpdatedAt });
    },
  ],
});