// BACKEND/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  ethers,
  JsonRpcProvider,
  Contract,
  Interface,
  zeroPadValue,
} from 'ethers';

// ---------- Env Bindings ----------
type Bindings = {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  // RPC + contract config
  BSC_RPC_URL?: string;
  CONTRACT_ADDRESS: string;
  START_BLOCK?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ---------- CORS ----------
app.use('/*', async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS ? c.env.ALLOWED_ORIGINS.split(',') : [];
  return await cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0] || ''),
  })(c, next);
});

// ---------- Schema (Auto-create if missing) ----------
async function ensureSchema(db: D1Database) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE,
      wallet_address TEXT UNIQUE,
      referrer_id TEXT,
      registration_tx_hash TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      login_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address, login_date)
    )`,
    `CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content_html TEXT,
      image_url TEXT,
      link_url TEXT,
      kind TEXT DEFAULT 'text',
      is_active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_key TEXT NOT NULL,
      wallet_address TEXT,
      fields_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    // optional: miners table (if you want dedicated table later)
    `CREATE TABLE IF NOT EXISTS miners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      amount_raw TEXT NOT NULL,
      start_time INTEGER,
      end_time INTEGER,
      tx_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  await db.batch(stmts.map((sql) => db.prepare(sql)));

  // Try to add 'kind' to existing notices if it's missing (ignore errors)
  try {
    await db.prepare(`ALTER TABLE notices ADD COLUMN kind TEXT DEFAULT 'text'`).run();
  } catch (_) {
    // ignore if exists
  }
}

app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// ---------- Contract ABI (CommunityPlatform minimal) ----------
const PLATFORM_ABI = [
  'function isRegistered(address) view returns (bool)',
  'function addressToUserId(address) view returns (string)',
  'function referrerOf(address) view returns (address)',
  'function hasSetFundCode(address) view returns (bool)',
  'function userBalances(address) view returns (uint256)',
  'function registrationFee() view returns (uint256)',
  'function owner() view returns (address)',
  'function getContractBalance() view returns (uint256)',
  'event UserRegistered(address indexed user, string userId, address indexed referrer)',
  'event MinerPurchased(address indexed user, uint256 amount, uint256 startTime, uint256 endTime)',
];

const iface = new Interface(PLATFORM_ABI);
const USER_REGISTERED_TOPIC0 = ethers.id('UserRegistered(address,string,address)');
// const MINER_PURCHASED_TOPIC0 = ethers.id('MinerPurchased(address,uint256,uint256,uint256)');

function getProvider(env: Bindings): JsonRpcProvider {
  const url = env.BSC_RPC_URL;
  if (!url) throw new Error('BSC_RPC_URL is not configured');
  return new JsonRpcProvider(url);
}

function getContract(env: Bindings, provider: JsonRpcProvider) {
  return new Contract(env.CONTRACT_ADDRESS, PLATFORM_ABI, provider);
}

function buildUserAuthMessage(address: string, timestamp: number) {
  return `I authorize the backend to sync my on-chain profile.\nAddress: ${ethers.getAddress(address)}\nTimestamp: ${timestamp}`;
}

function buildAdminAuthMessage(purpose: string, address: string, timestamp: number) {
  return `Admin action authorization\nPurpose: ${purpose}\nAddress: ${ethers.getAddress(address)}\nTimestamp: ${timestamp}`;
}

async function verifySignedMessage(expectedAddress: string, message: string, signature: string) {
  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    throw new Error('Invalid signature');
  }
  if (ethers.getAddress(recovered) !== ethers.getAddress(expectedAddress)) {
    throw new Error('Signature does not match address');
  }
}

async function requireOwner(env: Bindings, address: string) {
  const provider = getProvider(env);
  const contract = getContract(env, provider);
  const owner = await contract.owner();
  if (ethers.getAddress(owner) !== ethers.getAddress(address)) {
    throw new Error('Not authorized: only contract owner allowed');
  }
  return owner;
}

async function getRegistrationLogForUser(env: Bindings, address: string) {
  const provider = getProvider(env);
  const fromBlock = Number(env.START_BLOCK || 0);
  const paddedUser = zeroPadValue(ethers.getAddress(address), 32);

  const logs = await provider.getLogs({
    address: env.CONTRACT_ADDRESS,
    fromBlock,
    toBlock: 'latest',
    topics: [USER_REGISTERED_TOPIC0, paddedUser],
  });

  if (!logs || logs.length === 0) return null;

  const lg = logs[0];
  const block = await provider.getBlock(lg.blockNumber);
  let userIdFromEvent: string | undefined;
  let referrerFromEvent: string | undefined;
  try {
    const parsed = iface.parseLog(lg);
    userIdFromEvent = parsed?.args?.userId;
    referrerFromEvent = parsed?.args?.referrer;
  } catch {}
  return {
    txHash: lg.transactionHash,
    blockNumber: lg.blockNumber,
    timestamp: block?.timestamp ? Number(block.timestamp) : undefined,
    userIdFromEvent,
    referrerFromEvent,
  };
}

async function readUserFromChain(env: Bindings, addr: string) {
  const address = ethers.getAddress(addr);
  const provider = getProvider(env);
  const contract = getContract(env, provider);

  const [registered, userId, referrer, hasFundCode, balanceWei] = await Promise.all([
    contract.isRegistered(address),
    contract.addressToUserId(address),
    contract.referrerOf(address),
    contract.hasSetFundCode(address),
    contract.userBalances(address),
  ]);

  let referrerId = '';
  if (referrer && referrer !== ethers.ZeroAddress) {
    try {
      referrerId = await contract.addressToUserId(referrer);
    } catch {
      referrerId = '';
    }
  }

  const regLog = await getRegistrationLogForUser(env, address);

  return {
    address,
    isRegistered: Boolean(registered),
    userId: userId || '',
    referrerAddress: referrer && referrer !== ethers.ZeroAddress ? ethers.getAddress(referrer) : ethers.ZeroAddress,
    referrerId,
    hasFundCode: Boolean(hasFundCode),
    balanceWei: balanceWei ? BigInt(balanceWei) : 0n,
    registeredTxHash: regLog?.txHash,
    registeredBlockNumber: regLog?.blockNumber,
    registeredAt: regLog?.timestamp,
  };
}

async function getDbUserByAddress(db: D1Database, lowerAddr: string) {
  return db.prepare('SELECT user_id, referrer_id, registration_tx_hash FROM users WHERE wallet_address = ?')
    .bind(lowerAddr)
    .first<{ user_id: string; referrer_id: string; registration_tx_hash: string }>();
}

async function upsertDbUser(db: D1Database, payload: {
  walletAddress: string;
  userId: string;
  referrerId: string;
  txHash?: string;
  createdAtISO?: string;
}) {
  const createdAt = payload.createdAtISO || new Date().toISOString();
  const stmt = `
    INSERT INTO users (user_id, wallet_address, referrer_id, registration_tx_hash, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      user_id = excluded.user_id,
      referrer_id = excluded.referrer_id,
      registration_tx_hash = COALESCE(excluded.registration_tx_hash, registration_tx_hash),
      is_active = 1
  `;
  await db.prepare(stmt)
    .bind(
      payload.userId.toUpperCase(),
      payload.walletAddress.toLowerCase(),
      payload.referrerId?.toUpperCase() || '',
      payload.txHash || null,
      createdAt
    )
    .run();
}

function todayISODate() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function safeFormKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 48);
}

async function ensureDynamicFormTable(db: D1Database, key: string) {
  const table = `form_${safeFormKey(key)}`;
  const sql = `
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT,
      fields_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await db.prepare(sql).run();
  return table;
}

// ---------- API Routes ----------

// Health check
app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }));

// Bootstrap user status (chain + db)
app.get('/api/users/:address', async (c) => {
  try {
    const { address } = c.req.param();
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400);

    const lower = address.toLowerCase();
    const onChain = await readUserFromChain(c.env, address);
    const offChain = await getDbUserByAddress(c.env.DB, lower);

    const exists = Boolean(offChain);
    const action =
      onChain.isRegistered && exists
        ? 'redirect_dashboard'
        : onChain.isRegistered && !exists
        ? 'await_backend_sync'
        : 'show_register';

    return c.json({
      address: ethers.getAddress(address),
      onChain,
      offChain: exists
        ? {
            exists: true,
            userId: offChain!.user_id,
            referrerId: offChain!.referrer_id,
            registrationTxHash: offChain!.registration_tx_hash,
          }
        : { exists: false },
      action,
    });
  } catch (e: any) {
    console.error('GET /api/users/:address error:', e.stack || e.message);
    return c.json({ error: 'Server error' }, 500);
  }
});

// Sync user from chain (signed)
app.post('/api/users/upsert-from-chain', async (c) => {
  try {
    const body = await c.req.json<{ address: string; timestamp: number; signature: string }>();
    const { address, timestamp, signature } = body || ({} as any);

    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400);
    if (!timestamp || !signature) return c.json({ error: 'Missing timestamp/signature' }, 400);

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      return c.json({ error: 'Signature expired, please try again.' }, 400);
    }

    const message = buildUserAuthMessage(address, Number(timestamp));
    await verifySignedMessage(address, message, signature);

    const onChain = await readUserFromChain(c.env, address);
    if (!onChain.isRegistered) {
      return c.json({ error: 'Address is not registered on-chain' }, 400);
    }

    await upsertDbUser(c.env.DB, {
      walletAddress: address,
      userId: onChain.userId,
      referrerId: onChain.referrerId || '',
      txHash: onChain.registeredTxHash,
      createdAtISO: onChain.registeredAt ? new Date(onChain.registeredAt * 1000).toISOString() : undefined,
    });

    return c.json({ ok: true });
  } catch (e: any) {
    console.error('POST /api/users/upsert-from-chain error:', e.stack || e.message);
    return c.json({ error: 'Server error' }, 500);
  }
});

// Record daily login (signed)
app.post('/api/users/:address/login', async (c) => {
  try {
    const { address } = c.req.param();
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400);

    const body = await c.req.json<{ timestamp: number; signature: string }>();
    const { timestamp, signature } = body || ({} as any);

    if (!timestamp || !signature) return c.json({ error: 'Missing timestamp/signature' }, 400);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      return c.json({ error: 'Signature expired' }, 400);
    }

    const message = buildUserAuthMessage(address, Number(timestamp));
    await verifySignedMessage(address, message, signature);

    const lower = address.toLowerCase();
    const loginDate = todayISODate();

    await c.env.DB.prepare('INSERT OR IGNORE INTO logins (wallet_address, login_date) VALUES (?, ?)')
      .bind(lower, loginDate)
      .run();

    const row = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?')
      .bind(lower)
      .first<{ cnt: number }>();

    return c.json({ ok: true, total_login_days: row?.cnt || 0 });
  } catch (e: any) {
    console.error('POST /api/users/:address/login error:', e.stack || e.message);
    return c.json({ error: 'Server error' }, 500);
  }
});

// Dashboard data
app.get('/api/dashboard/:walletAddress', async (c) => {
  const { walletAddress } = c.req.param();
  if (!ethers.isAddress(walletAddress)) {
    return c.json({ error: 'Invalid wallet address' }, 400);
  }

  try {
    const db = c.env.DB;
    const lower = walletAddress.toLowerCase();

    const user = await db.prepare('SELECT user_id FROM users WHERE wallet_address = ?').bind(lower).first<{ user_id: string }>();
    if (!user) return c.json({ error: 'User not found' }, 404);

    const userId = user.user_id;

    // Level 1 referrals
    const level1 = await db.prepare('SELECT user_id FROM users WHERE referrer_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<{ user_id: string }>();
    const level1Ids = (level1.results || []).map(u => u.user_id);
    const level1Count = level1Ids.length;

    // Level 2
    let level2Ids: string[] = [];
    if (level1Ids.length > 0) {
      const placeholders = level1Ids.map(() => '?').join(',');
      const level2Rows = await db.prepare(`SELECT user_id FROM users WHERE referrer_id IN (${placeholders})`)
        .bind(...level1Ids)
        .all<{ user_id: string }>();
      level2Ids = (level2Rows.results || []).map(u => u.user_id);
    }
    const level2Count = level2Ids.length;

    // Level 3
    let level3Count = 0;
    if (level2Ids.length > 0) {
      const placeholders = level2Ids.map(() => '?').join(',');
      const level3Rows = await db.prepare(`SELECT COUNT(*) as count FROM users WHERE referrer_id IN (${placeholders})`)
        .bind(...level2Ids)
        .first<{ count: number }>();
      level3Count = level3Rows?.count || 0;
    }

    const totalReferrals = level1Count + level2Count + level3Count;

    // Total login days
    const loginRow = await db.prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?')
      .bind(lower)
      .first<{ cnt: number }>();
    const totalLoginDays = loginRow?.cnt || 0;

    // Commission breakdown estimate (based on current registration fee)
    const provider = getProvider(c.env);
    const contract = getContract(c.env, provider);
    const feeRaw: bigint = BigInt(await contract.registrationFee());

    const l1TotalRaw = (feeRaw * 40n / 100n) * BigInt(level1Count);
    const l2TotalRaw = (feeRaw * 20n / 100n) * BigInt(level2Count);
    const l3TotalRaw = (feeRaw * 10n / 100n) * BigInt(level3Count);
    const commissionEstimateRaw = (l1TotalRaw + l2TotalRaw + l3TotalRaw).toString();

    // Notices (active, top 10)
    const noticesRes = await db.prepare(
      'SELECT id, title, content_html, image_url, link_url, kind, priority, created_at FROM notices WHERE is_active = 1 ORDER BY priority DESC, id DESC LIMIT 10'
    ).all<{ id: number; title: string; content_html: string; image_url: string; link_url: string; kind: string; priority: number; created_at: string }>();

    // Mining stats off-chain from form_mining (dynamic table)
    let minerCount = 0;
    let totalDeposited = 0;
    try {
      const res = await db.prepare('SELECT fields_json FROM form_mining WHERE wallet_address = ?')
        .bind(lower)
        .all<{ fields_json: string }>();
      for (const row of (res.results || [])) {
        try {
          const obj = JSON.parse(row.fields_json || '{}');
          const amt = Number(obj?.amount_usdt || 0);
          if (!isNaN(amt) && amt > 0) {
            minerCount += 1;
            totalDeposited += amt;
          }
        } catch {}
      }
    } catch {
      // table may not exist yet
    }

    return c.json({
      userId,
      referralStats: {
        total_referrals: totalReferrals,
        level1_count: level1Count,
        level2_count: level2Count,
        level3_count: level3Count,
      },
      level1_list: level1Ids, // for frontend referral list fallback
      logins: {
        total_login_days: totalLoginDays,
      },
      commissions: {
        registration_fee_raw: feeRaw.toString(),
        l1_total_raw: l1TotalRaw.toString(),
        l2_total_raw: l2TotalRaw.toString(),
        l3_total_raw: l3TotalRaw.toString(),
        total_estimated_raw: commissionEstimateRaw,
        percentages: { l1: 40, l2: 20, l3: 10 }
      },
      notices: (noticesRes.results || []).map(n => ({
        id: n.id,
        title: n.title,
        content_html: n.content_html,
        image_url: n.image_url,
        link_url: n.link_url,
        kind: n.kind || 'text',
        priority: n.priority,
        created_at: n.created_at,
      })),
      miningStats: {
        miner_count: minerCount,
        total_deposited: totalDeposited, // USDT (number)
      },
      earningHistory: [],
    });
  } catch (e: any) {
    console.error('Dashboard data error:', e.stack || e.message);
    return c.json({ error: 'Server error fetching dashboard data' }, 500);
  }
});

// ---------- Referrals (Level-1 list) ----------
app.get('/api/referrals/:walletAddress', async (c) => {
  try {
    const { walletAddress } = c.req.param();
    if (!ethers.isAddress(walletAddress)) return c.json({ error: 'Invalid wallet address' }, 400);

    const lower = walletAddress.toLowerCase();
    const db = c.env.DB;

    const user = await db.prepare('SELECT user_id FROM users WHERE wallet_address = ?')
      .bind(lower)
      .first<{ user_id: string }>();
    if (!user) return c.json({ list: [] });

    const level1 = await db.prepare('SELECT user_id FROM users WHERE referrer_id = ? ORDER BY created_at DESC')
      .bind(user.user_id)
      .all<{ user_id: string }>();

    const list = (level1.results || []).map(r => r.user_id);
    return c.json({ list });
  } catch (e: any) {
    console.error('GET /api/referrals/:walletAddress error:', e.stack || e.message);
    return c.json({ list: [] });
  }
});

// ---------- Notices: Public list ----------
app.get('/api/notices', async (c) => {
  try {
    const url = new URL(c.req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') || '10'), 50);
    const onlyActive = url.searchParams.get('active') !== '0';

    const where = onlyActive ? 'WHERE is_active = 1' : '';
    const stmt = `SELECT id, title, content_html, image_url, link_url, kind, priority, created_at FROM notices ${where} ORDER BY priority DESC, id DESC LIMIT ?`;
    const res = await c.env.DB.prepare(stmt).bind(limit).all();

    return c.json({
      notices: (res.results || []).map((n: any) => ({
        id: n.id,
        title: n.title,
        content_html: n.content_html,
        image_url: n.image_url,
        link_url: n.link_url,
        kind: n.kind || 'text',
        priority: n.priority,
        created_at: n.created_at,
      })),
    });
  } catch (e: any) {
    console.error('GET /api/notices error:', e.stack || e.message);
    return c.json({ error: 'Server error' }, 500);
  }
});

// ---------- Notices: Admin create/update (owner only, signed) ----------
app.post('/api/notices', async (c) => {
  try {
    const body = await c.req.json<{
      address: string;
      timestamp: number;
      signature: string;
      title?: string;
      content_html?: string;
      image_url?: string;
      link_url?: string;
      is_active?: boolean;
      priority?: number;
      kind?: 'image' | 'text' | 'script';
    }>();

    const { address, timestamp, signature } = body || ({} as any);
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid address' }, 400);
    if (!timestamp || !signature) return c.json({ error: 'Missing auth params' }, 400);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) return c.json({ error: 'Signature expired' }, 400);

    const msg = buildAdminAuthMessage('create_notice', address, Number(timestamp));
    await verifySignedMessage(address, msg, signature);
    await requireOwner(c.env, address);

    const title = (body.title || '').trim();
    const is_active = body.is_active === false ? 0 : 1;
    const priority = Number.isFinite(body.priority) ? Number(body.priority) : 0;

    const kind = (body.kind || 'text');
    if (!['image', 'text', 'script'].includes(kind)) {
      return c.json({ error: 'Invalid notice kind' }, 400);
    }

    const image_url = kind === 'image' ? (body.image_url || '') : '';
    const link_url = kind === 'image' ? (body.link_url || '') : '';
    const content_html =
      kind === 'text' ? (body.content_html || '') :
      kind === 'script' ? (body.content_html || '') : '';

    await c.env.DB.prepare(
      `INSERT INTO notices (title, content_html, image_url, link_url, kind, is_active, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(title, content_html, image_url, link_url, kind, is_active, priority, new Date().toISOString())
      .run();

    return c.json({ ok: true });
  } catch (e: any) {
    console.error('POST /api/notices error:', e.stack || e.message);
    return c.json({ error: 'Server error' }, 500);
  }
});

app.patch('/api/notices/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json<{
      address: string;
      timestamp: number;
      signature: string;
      title?: string;
      content_html?: string;
      image_url?: string;
      link_url?: string;
      is_active?: boolean;
      priority?: number;
      kind?: 'image' | 'text' | 'script';
    }>();

    const { address, timestamp, signature } = body || ({} as any);
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid address' }, 400);
    if (!timestamp || !signature) return c.json({ error: 'Missing auth params' }, 400);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) return c.json({ error: 'Signature expired' }, 400);

    const msg = buildAdminAuthMessage('update_notice', address, Number(timestamp));
    await verifySignedMessage(address, msg, signature);
    await requireOwner(c.env, address);

    const fields: string[] = [];
    const values: any[] = [];
    if (typeof body.title === 'string') { fields.push('title = ?'); values.push(body.title.trim()); }
    if (typeof body.content_html === 'string') { fields.push('content_html = ?'); values.push(body.content_html); }
    if (typeof body.image_url === 'string') { fields.push('image_url = ?'); values.push(body.image_url); }
    if (typeof body.link_url === 'string') { fields.push('link_url = ?'); values.push(body.link_url); }
    if (typeof body.priority === 'number') { fields.push('priority = ?'); values.push(Number(body.priority)); }
    if (typeof body.is_active === 'boolean') { fields.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }
    if (typeof body.kind === 'string' && ['image', 'text', 'script'].includes(body.kind)) {
      fields.push('kind = ?'); values.push(body.kind);
    }

    fields.push('updated_at = ?'); values.push(new Date().toISOString());

    if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);

    const sql = `UPDATE notices SET ${fields.join(', ')} WHERE id = ?`;
    values.push(Number(id));
    await c.env.DB.prepare(sql).bind(...values).run();

    return c.json({ ok: true });
  } catch (e: any) {
    console.error('PATCH /api/notices/:id error:', e.stack || e.message);
    return c.json({ error: 'Server error' }, 500);
  }
});

// ---------- Dynamic form submissions (auto-table) ----------
app.post('/api/forms/:formKey/submit', async (c) => {
  try {
    const { formKey } = c.req.param();
    const body = await c.req.json<{ wallet_address?: string; fields: Record<string, any> }>();
    const wallet = body.wallet_address && ethers.isAddress(body.wallet_address) ? ethers.getAddress(body.wallet_address) : null;
    const safeKey = safeFormKey(formKey);

    const table = await ensureDynamicFormTable(c.env.DB, safeKey);
    await c.env.DB.prepare(
      `INSERT INTO ${table} (wallet_address, fields_json) VALUES (?, ?)`
    )
    .bind(wallet ? wallet.toLowerCase() : null, JSON.stringify(body.fields || {}))
    .run();

    return c.json({ ok: true });
  } catch (e: any) {
    console.error('POST /api/forms/:formKey/submit error:', e.stack || e.message);
    return c.json({ error: 'Server error' }, 500);
  }
});

// ---------- Admin overview (owner only, signed) ----------
app.post('/api/admin/overview', async (c) => {
  try {
    const body = await c.req.json<{ address: string; timestamp: number; signature: string }>();
    const { address, timestamp, signature } = body || ({} as any);
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid address' }, 400);
    if (!timestamp || !signature) return c.json({ error: 'Missing auth params' }, 400);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) return c.json({ error: 'Signature expired' }, 400);

    const msg = buildAdminAuthMessage('admin_overview', address, Number(timestamp));
    await verifySignedMessage(address, msg, signature);
    const owner = await requireOwner(c.env, address);

    const db = c.env.DB;
    const totalUsersRow = await db.prepare('SELECT COUNT(*) AS cnt FROM users').first<{ cnt: number }>();

    const provider = getProvider(c.env);
    const contract = getContract(c.env, provider);
    const balanceRaw: bigint = BigInt(await contract.getContractBalance());

    return c.json({
      ok: true,
      owner: ethers.getAddress(owner),
      totals: {
        total_registered_users: totalUsersRow?.cnt || 0,
        contract_balance_raw: balanceRaw.toString(),
      },
    });
  } catch (e: any) {
    console.error('POST /api/admin/overview error:', e.stack || e.message);
    return c.json({ error: 'Server error' }, 500);
  }
});

export default app;
