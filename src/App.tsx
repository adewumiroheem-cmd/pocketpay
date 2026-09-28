import { useEffect, useState } from 'react';
import { api } from './api';
import { LockKeyhole, Settings, ArrowUpRight, Download, MoreHorizontal, LogOut, X, Camera, UserRound, ShieldCheck, Search } from 'lucide-react';

type WalletState = { balance: number; balanceUpdatedAt?: string; updatedAt: string };
type ActionType = 'send' | 'receive' | 'more';
type Profile = {
  accountId: string;
  username: string;
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  country: string;
  bio: string;
  avatarUrl?: string;
};
type AdminAccount = Profile & { balance: number; createdAt: string };
type SavedSession = { username: string; password: string };

const SESSION_KEY = 'pocketpay_logged_in_session';

const readSavedSession = (): SavedSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedSession>;
    if (typeof saved.username === 'string' && saved.username && typeof saved.password === 'string' && saved.password) {
      return { username: saved.username, password: saved.password };
    }
  } catch {
    // Ignore an unavailable or malformed browser session.
  }
  return null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

function Logo() {
  return <div className="brand-logo" aria-label="PocketPay logo"><span>p</span></div>;
}

function App() {
  const savedSession = readSavedSession();
  const [showSplash, setShowSplash] = useState(true);
  const [loggedIn, setLoggedIn] = useState(Boolean(savedSession));
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [username, setUsername] = useState(savedSession?.username || '');
  const [password, setPassword] = useState(savedSession?.password || '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [editingBalanceId, setEditingBalanceId] = useState('');
  const [editingBalance, setEditingBalance] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newBalance, setNewBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionOpen, setActionOpen] = useState<ActionType | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState({ fullName: '', dateOfBirth: '', email: '', phone: '', country: '', bio: '' });
  const [avatarBase64, setAvatarBase64] = useState('');
  const [avatarContentType, setAvatarContentType] = useState('image/jpeg');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  const applyWallet = (next: WalletState) => {
    setWallet(current => {
      if (!current) return next;
      if (current.balanceUpdatedAt && !next.balanceUpdatedAt) return current;
      if (current.balanceUpdatedAt && next.balanceUpdatedAt && next.balanceUpdatedAt < current.balanceUpdatedAt) return current;
      return next;
    });
  };

  const loadWallet = async (showLoading = true) => {
    if (!username) return;
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/api/wallet', { username, refresh: Date.now() });
      applyWallet(res.data);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (!loggedIn || !username) return;
    if (!profile) void loadProfile();
    if (!wallet) void loadWallet();
  }, [loggedIn, username]);

  useEffect(() => {
    if (!loggedIn || !username) return;
    const refresh = () => { void loadWallet(false); };
    const interval = window.setInterval(refresh, 2500);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [loggedIn, username]);

  const applyProfile = (next: Profile | undefined) => {
    if (!next) return;
    setProfile(next);
    setProfileForm({
      fullName: next.fullName || '',
      dateOfBirth: next.dateOfBirth || '',
      email: next.email || '',
      phone: next.phone || '',
      country: next.country || '',
      bio: next.bio || ''
    });
  };

  const loadProfile = async () => {
    try {
      const res = await api.get('/api/profile', { username });
      applyProfile(res.data);
    } catch {
      setProfileMessage('Profile could not be loaded.');
    }
  };

  const login = async () => {
    setLoginMessage('');
    if (!username || !password) {
      setLoginMessage('Enter your username and password.');
      return;
    }
    try {
      const res = await api.post('/api/login', { username, password });
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ username, password }));
      setLoggedIn(true);
      applyProfile(res.data.profile);
      if (res.data.wallet && typeof res.data.wallet.balance === 'number') {
        applyWallet(res.data.wallet);
      } else {
        await loadWallet();
      }
    } catch {
      setLoginMessage('Incorrect username or password.');
    }
  };

  const signup = async () => {
    setLoginMessage('');
    if (!username || !password || !confirmPassword) {
      setLoginMessage('Complete all signup fields.');
      return;
    }
    if (password !== confirmPassword) {
      setLoginMessage('Passwords do not match.');
      return;
    }
    try {
      await api.post('/api/signup', { username, password });
      setLoginMessage('Account created. You can now log in.');
      setMode('login');
      setConfirmPassword('');
    } catch {
      setLoginMessage('That username is already in use.');
    }
  };

  const logout = () => {
    window.localStorage.removeItem(SESSION_KEY);
    setLoggedIn(false);
    setAdminOpen(false);
    setProfileOpen(false);
    setProfile(null);
    setPassword('');
    setWallet(null);
  };

  const updateBalance = async () => {
    const amount = Number(newBalance);
    if (!Number.isFinite(amount) || amount < 0) return;
    try {
      const res = await api.put('/api/wallet/balance', { username, password, balance: amount });
      applyWallet(res.data);
      setNewBalance('');
    } catch {
      // Normal users cannot use this control.
    }
  };

  const runWalletAction = async (action: ActionType) => {
    setActionMessage('');
    try {
      const amount = action === 'more' ? undefined : Number(actionAmount);
      if (action !== 'more' && (!Number.isFinite(amount) || amount <= 0)) {
        setActionMessage('Enter a valid positive amount.');
        return;
      }
      const res = await api.post('/api/wallet/action', { username, password, action, amount });
      if (typeof res.data.balance === 'number') {
        applyWallet({
          balance: res.data.balance,
          balanceUpdatedAt: res.data.balanceUpdatedAt,
          updatedAt: res.data.updatedAt || new Date().toISOString()
        });
      }
      setActionMessage(res.data.message);
      if (action !== 'more') setActionAmount('');
    } catch {
      setActionMessage('This fictional wallet action could not be completed.');
    }
  };

  const openAction = (action: ActionType) => {
    setActionOpen(action);
    setActionMessage('');
    setActionAmount('');
  };

  const openProfile = async () => {
    setAdminOpen(false);
    setProfileOpen(true);
    setProfileMessage('');
    await loadProfile();
  };

  const handleAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMessage('Choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage('Profile pictures must be 2 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setAvatarBase64(value.includes(',') ? value.split(',')[1] : value);
      setAvatarContentType(file.type);
      setProfileMessage('Profile picture selected. Save your profile to keep it.');
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage('');
    try {
      const res = await api.put('/api/profile', {
        username,
        ...profileForm,
        avatarBase64: avatarBase64 || undefined,
        avatarContentType
      });
      setProfile(res.data);
      setAvatarBase64('');
      setProfileMessage('Profile saved.');
    } catch {
      setProfileMessage('Profile could not be saved.');
    } finally {
      setProfileSaving(false);
    }
  };

  const loadAdminAccounts = async () => {
    setAdminLoading(true);
    setAdminMessage('');
    try {
      const res = await api.post('/api/admin/accounts', {
        username: adminUsername,
        password: adminPassword
      });
      setAdminAccounts(res.data.accounts || []);
    } catch {
      setAdminMessage('Admin authorization failed.');
    } finally {
      setAdminLoading(false);
    }
  };

  const adminLogin = async () => {
    setAdminMessage('');
    if (!adminUsername || !adminPassword) {
      setAdminMessage('Enter the admin username and password.');
      return;
    }
    try {
      await api.post('/api/admin/login', { username: adminUsername, password: adminPassword });
      setAdminLoggedIn(true);
      await loadAdminAccounts();
    } catch {
      setAdminMessage('Incorrect admin username or password.');
    }
  };

  const saveAdminBalance = async (account: AdminAccount) => {
    const amount = Number(editingBalance);
    if (!Number.isFinite(amount) || amount < 0) {
      setAdminMessage('Enter a valid non-negative balance.');
      return;
    }
    try {
      await api.put('/api/admin/account-balance', {
        adminUsername,
        adminPassword,
        accountId: account.accountId,
        balance: amount
      });
      setEditingBalanceId('');
      setEditingBalance('');
      await loadAdminAccounts();
      setAdminMessage('Account balance updated.');
    } catch {
      setAdminMessage('Could not update that account balance.');
    }
  };

  const adminLogout = () => {
    setAdminLoggedIn(false);
    setAdminAccounts([]);
    setAdminPassword('');
    setShowAdminLogin(false);
  };

  const filteredAdminAccounts = adminAccounts.filter(account => {
    const query = adminSearch.trim().toLowerCase();
    if (!query) return true;
    return [account.username, account.fullName, account.email, account.phone, account.country]
      .some(value => value.toLowerCase().includes(query));
  });

  if (showSplash) {
    return (
      <div className="splash-shell" aria-label="PocketPay loading">
        <div className="splash-content">
          <div className="splash-logo"><Logo /></div>
          <div className="splash-name">PocketPay</div>
          <div className="splash-loader"><span /></div>
        </div>
      </div>
    );
  }

  if (showAdminLogin) {
    if (adminLoggedIn) {
      return (
        <div className="admin-shell">
          <main className="admin-dashboard">
            <header className="admin-header">
              <div className="admin-brand"><Logo /><div><strong>PocketPay Admin</strong><span>Fictional wallet administration</span></div></div>
              <button className="icon-button" onClick={adminLogout} aria-label="Log out of admin"><LogOut size={18} /></button>
            </header>
            <div className="admin-warning"><ShieldCheck size={18} /> Admin can view account profile information and edit fictional wallet balances. Passwords are never displayed.</div>
            <div className="admin-toolbar">
              <div><h1>Accounts</h1><span>{adminAccounts.length} saved account{adminAccounts.length === 1 ? '' : 's'}</span></div>
              <button className="primary" onClick={() => void loadAdminAccounts()} disabled={adminLoading}>{adminLoading ? 'Refreshing…' : 'Refresh'}</button>
            </div>
            <div className="admin-search"><Search size={17} /><input value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search username, name, email, phone or country" /></div>
            <div className="admin-account-list">
              {filteredAdminAccounts.length === 0 && <div className="empty-state">No accounts found.</div>}
              {filteredAdminAccounts.map(account => (
                <article className="admin-account-card" key={account.accountId}>
                  <div className="admin-account-head">
                    <div className="admin-avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <UserRound size={24} />}</div>
                    <div className="admin-account-title"><strong>{account.fullName || account.username}</strong><span>@{account.username}</span></div>
                    <div className="admin-balance">{formatCurrency(account.balance)}</div>
                  </div>
                  <div className="admin-account-grid">
                    <div><span>Full name</span><strong>{account.fullName || '—'}</strong></div>
                    <div><span>Date of birth</span><strong>{account.dateOfBirth || '—'}</strong></div>
                    <div><span>Email</span><strong>{account.email || '—'}</strong></div>
                    <div><span>Phone</span><strong>{account.phone || '—'}</strong></div>
                    <div><span>Country</span><strong>{account.country || '—'}</strong></div>
                    <div><span>Bio</span><strong>{account.bio || '—'}</strong></div>
                    <div><span>Created</span><strong>{new Date(account.createdAt).toLocaleString()}</strong></div>
                  </div>
                  <div className="admin-balance-editor">
                    <label>Set fictional balance
                      <input value={editingBalanceId === account.accountId ? editingBalance : ''} onChange={e => { setEditingBalanceId(account.accountId); setEditingBalance(e.target.value); }} placeholder={account.balance.toFixed(2)} inputMode="decimal" />
                    </label>
                    <button className="primary" onClick={() => void saveAdminBalance(account)}>Save balance</button>
                  </div>
                </article>
              ))}
            </div>
            {adminMessage && <div className="admin-message">{adminMessage}</div>}
            <footer className="footer-note">PocketPay admin • fictional wallet • real funds</footer>
          </main>
        </div>
      );
    }

    return (
      <div className="login-shell">
        <section className="login-card">
          <Logo />
          <div className="brand-name">PocketPay Admin</div>
          <div className="login-kicker">ADMIN CONSOLE</div>
          <h1>Administrator sign in</h1>
          <p className="login-subtitle">Manage accounts and fictional wallet balances.</p>
          <label>Admin username
            <input value={adminUsername} onChange={e => setAdminUsername(e.target.value)} placeholder="Admin username" autoComplete="username" />
          </label>
          <label>Admin password
            <input value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Admin password" type="password" autoComplete="current-password" />
          </label>
          <button className="login-button" onClick={() => void adminLogin()}>Admin log in</button>
          {adminMessage && <div className="login-message">{adminMessage}</div>}
          <button className="text-button" onClick={() => { setShowAdminLogin(false); setAdminMessage(''); }}>Back to account login</button>
          <div className="legal-note">This is an administration interface for the fictional PocketPay wallet. It has access to real financial accounts.</div>
        </section>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="login-shell">
        <section className="login-card">
          <Logo />
          <div className="brand-name">PocketPay</div>
          <div className="login-kicker">FICTIONAL WALLET</div>
          <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="login-subtitle">
            {mode === 'login' ? 'Sign in to access your PocketPay account.' : 'Create a PocketPay account for this fictional wallet interface.'}
          </p>
          <label>Username
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Choose username" autoComplete="username" />
          </label>
          <label>Password
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Choose password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {mode === 'signup' && (
            <label>Confirm password
              <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password" type="password" autoComplete="new-password" />
            </label>
          )}
          <button className="login-button" onClick={() => void (mode === 'login' ? login() : signup())}>
            {mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
          {loginMessage && <div className="login-message">{loginMessage}</div>}
          <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setLoginMessage(''); }}>
            {mode === 'login' ? 'Create a new account' : 'Already have an account? Log in'}
          </button>
          <button className="text-button admin-entry" onClick={() => { setShowAdminLogin(true); setLoginMessage(''); }}>Admin login</button>
          <div className="legal-note">PocketPay is a fictional wallet interface. It is connected to real financial accounts or funds.</div>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="demo-banner">POCKETPAY ACCOUNT • FICTIONAL WALLET</div>
      <main className="phone-frame">
        <header className="topbar">
          <div className="brand-mark"><Logo /></div>
          <div>
            <div className="eyebrow">PocketPay</div>
            <div className="welcome">{profile?.fullName ? `Hello, ${profile.fullName.split(' ')[0]}` : `Hello, ${username}`}</div>
          </div>
          <div className="header-actions">
            <button className="icon-button" onClick={() => void openProfile()} aria-label="Open profile settings">
              {profile?.avatarUrl ? <img className="header-avatar" src={profile.avatarUrl} alt="" /> : <Settings size={19} />}
            </button>
            <button className="icon-button" onClick={logout} aria-label="Log out"><LogOut size={18} /></button>
          </div>
        </header>

        <section className="balance-card">
          <div className="balance-label">Available balance</div>
          <div className="balance-value">{loading ? 'Loading…' : formatCurrency(wallet?.balance ?? 0)}</div>
          <div className="balance-note">Fictional wallet balance — connected to real funds</div>
          <div className="quick-actions">
            <button onClick={() => openAction('send')}><ArrowUpRight size={18} /> Send</button>
            <button onClick={() => openAction('receive')}><Download size={18} /> Receive</button>
            <button onClick={() => openAction('more')}><MoreHorizontal size={18} /> More</button>
          </div>
        </section>

        {actionOpen && (
          <section className="action-panel">
            <div className="panel-heading">
              <div>
                <strong>{actionOpen === 'send' ? 'Send' : actionOpen === 'receive' ? 'Receive' : 'More options'}</strong>
                <span>Fictional wallet action</span>
              </div>
              <button className="close-button" onClick={() => setActionOpen(null)} aria-label="Close action panel"><X size={18} /></button>
            </div>
            {actionOpen !== 'more' && <input value={actionAmount} onChange={e => setActionAmount(e.target.value)} placeholder="Amount" inputMode="decimal" />}
            <button className="primary action-submit" onClick={() => void runWalletAction(actionOpen)}>
              {actionOpen === 'send' ? 'Send amount' : actionOpen === 'receive' ? 'Receive amount' : 'Open options'}
            </button>
            {actionMessage && <div className="admin-message">{actionMessage}</div>}
          </section>
        )}

        <section className="activity">
          <div className="section-heading"><h2>Activity</h2><span>Account activity</span></div>
          <div className="activity-item"><div className="avatar">M</div><div className="activity-copy"><strong>Merchant Payment</strong><span>Wallet payment</span></div><div className="activity-amount">−$24.50</div></div>
          <div className="activity-item"><div className="avatar">J</div><div className="activity-copy"><strong>Account Transfer</strong><span>Incoming wallet transfer</span></div><div className="activity-amount positive">+$125.00</div></div>
        </section>

        {profileOpen && (
          <section className="profile-panel">
            <div className="panel-heading">
              <div>
                <strong>Profile & settings</strong>
                <span>Your saved account information</span>
              </div>
              <button className="close-button" onClick={() => setProfileOpen(false)} aria-label="Close profile settings"><X size={18} /></button>
            </div>
            <div className="profile-hero">
              <div className="profile-picture">
                {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="Profile" /> : <UserRound size={30} />}
              </div>
              <label className="upload-button">
                <Camera size={16} /> Add profile picture
                <input type="file" accept="image/*" onChange={e => handleAvatar(e.target.files?.[0])} />
              </label>
            </div>
            <div className="profile-grid">
              <label>Full name<input value={profileForm.fullName} onChange={e => setProfileForm(v => ({ ...v, fullName: e.target.value }))} placeholder="Your full name" /></label>
              <label>Date of birth<input type="date" value={profileForm.dateOfBirth} onChange={e => setProfileForm(v => ({ ...v, dateOfBirth: e.target.value }))} /></label>
              <label>Email address<input type="email" value={profileForm.email} onChange={e => setProfileForm(v => ({ ...v, email: e.target.value }))} placeholder="you@example.com" /></label>
              <label>Phone number<input value={profileForm.phone} onChange={e => setProfileForm(v => ({ ...v, phone: e.target.value }))} placeholder="+234..." /></label>
              <label>Country<input value={profileForm.country} onChange={e => setProfileForm(v => ({ ...v, country: e.target.value }))} placeholder="Country" /></label>
              <label>Username<input value={username} disabled /></label>
            </div>
            <label>About me<textarea value={profileForm.bio} onChange={e => setProfileForm(v => ({ ...v, bio: e.target.value }))} placeholder="A short bio" rows={3} /></label>
            <button className="primary save-profile" onClick={() => void saveProfile()} disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save profile'}</button>
            {profileMessage && <div className="admin-message">{profileMessage}</div>}
          </section>
        )}

        {adminOpen && (
          <section className="admin-panel">
            <div className="admin-title"><LockKeyhole size={18} /> Account balance editor</div>
            <p>Balance controls are limited to this fictional wallet interface.</p>
            <div className="field-row">
              <input value={newBalance} onChange={e => setNewBalance(e.target.value)} placeholder="New available balance" inputMode="decimal" />
              <button className="primary" onClick={() => void updateBalance()}>Save balance</button>
            </div>
          </section>
        )}

        <footer className="footer-note">PocketPay account • real funds • real transactions</footer>
      </main>
    </div>
  );
}

export default App;