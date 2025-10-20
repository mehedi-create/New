// backend/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ethers, JsonRpcProvider, Contract, Interface } from 'ethers'

// ---------- Env Bindings ----------
type Bindings = {
  DB: D1Database
  ALLOWED_ORIGINS: string
  BSC_RPC_URL?: string
  CONTRACT_ADDRESS: string
}

const app = new Hono<{ Bindings: Bindings }>()

// in-memory guards (simple, per-worker)
const inflightUpsert = new Set<string>()
const lastUpsertAt = new Map<string, number>()

// ---------- CORS ----------
app.use('/*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return cors({
    origin: (origin) => {
      if (!origin) return allowed[0] || '*'
      return allowed.includes(origin) ? origin : allowed[0] || '*'
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next)
})

// ---------- Error/NotFound ----------
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Server error' }, 500)
})
app.notFound((c) => {
  const path = new URL(c.req.url).pathname
  return c.json({ ok: false, error: 'NOT_FOUND', path }, 404)
})

// ---------- Schema ----------
async function ensureSchema(db: D1Database) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      wallet_address TEXT UNIQUE,
      referrer_id TEXT,
      is_active INTEGER DEFAULT 1,
      coin_balance INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS referral_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referred_wallet TEXT UNIQUE,
      referrer_id TEXT,
      reward_coins INTEGER DEFAULT 5,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mining_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      tx_hash TEXT UNIQUE,
      daily_coins INTEGER NOT NULL,
      total_days INTEGER DEFAULT 30,
      credited_days INTEGER DEFAULT 0,
      start_date TEXT NOT NULL,
      last_credit_date TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS admin_coin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      admin TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
  ]
  await db.batch(stmts.map((sql) => db.prepare(sql)))

  try { await db.prepare(`ALTER TABLE users ADD COLUMN coin_balance INTEGER DEFAULT 0`).run() } catch {}
  try { await db.prepare(`ALTER TABLE notices ADD COLUMN kind TEXT DEFAULT 'text'`).run() } catch {}
  try { await db.prepare(`ALTER TABLE notices ADD COLUMN expires_at TEXT`).run() } catch {}
  try { await db.prepare(`ALTER TABLE admin_coin_audit ADD COLUMN reason TEXT`).run() } catch {}
}
app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB)
  await next()
})

// ---------- Minimal on-chain helpers ----------
const PLATFORM_ABI = [
  'function isRegistered(address) view returns (bool)',
  'function addressToUserId(address) view returns (string)',
  'function referrerOf(address) view returns (address)',
  'function owner() view returns (address)',
  'function usdtToken() view returns (address)',
  'event MinerPurchased(address indexed user, uint256 amount, uint256 startTime, uint256 endTime)',
]
const ERC20_ABI = ['function decimals() view returns (uint8)']

const MINER_PURCHASED_TOPIC = ethers.id('MinerPurchased(address,uint256,uint256,uint256)')
const IFACE = new Interface(PLATFORM_ABI)

function getProvider(env: Bindings): JsonRpcProvider {
  const url = (env.BSC_RPC_URL || '').replace(/\/+$/, '')
  if (!url) throw new Error('BSC_RPC_URL is not configured')
  return new JsonRpcProvider(url)
}
function getContract(env: Bindings, provider: JsonRpcProvider) {
  return new Contract(env.CONTRACT_ADDRESS, PLATFORM_ABI, provider)
}

// cache decimals
let DECIMALS_CACHE: number | null = null
let USDT_ADDR_CACHE: string | null = null
async function getTokenDecimals(env: Bindings): Promise<{ address: string; decimals: number }> {
  if (DECIMALS_CACHE && USDT_ADDR_CACHE) return { address: USDT_ADDR_CACHE!, decimals: DECIMALS_CACHE! }
  const provider = getProvider(env)
  const platform = getContract(env, provider)
  let usdtAddr = ''
  try { usdtAddr = await platform.usdtToken() } catch {}
  let dec = 18
  if (usdtAddr && usdtAddr !== ethers.ZeroAddress) {
    const erc20 = new Contract(usdtAddr, ERC20_ABI, provider)
    try { dec = Number(await erc20.decimals()) || 18 } catch { dec = 18 }
  }
  DECIMALS_CACHE = dec
  USDT_ADDR_CACHE = usdtAddr || ethers.ZeroAddress
  return { address: USDT_ADDR_CACHE, decimals: DECIMALS_CACHE }
}

function todayISODate() { return new Date().toISOString().slice(0, 10) }
function isoDateFromUnix(sec: number) { return new Date(sec * 1000).toISOString().slice(0, 10) }
function daysBetweenInclusive(startDate: string, endDate: string) {
  const a = new Date(`${startDate}T00:00:00Z`).getTime()
  const b = new Date(`${endDate}T00:00:00Z`).getTime()
  if (isNaN(a) || isNaN(b)) return 0
  const diffDays = Math.floor((b - a) / (24 * 3600 * 1000))
  return diffDays < 0 ? 0 : diffDays + 1
}

// ---------- Sign/Verify helpers ----------
function buildUserAuthMessage(address: string, timestamp: number) {
  return `I authorize the backend to sync my on-chain profile.
Address: ${ethers.getAddress(address)}
Timestamp: ${timestamp}`
}
async function verifySignedMessage(expectedAddress: string, message: string, signature: string) {
  let recovered: string
  try { recovered = ethers.verifyMessage(message, signature) } catch { throw new Error('Invalid signature') }
  if (ethers.getAddress(recovered) !== ethers.getAddress(expectedAddress)) throw new Error('Signature does not match address')
}
async function requireOwner(env: Bindings, address: string) {
  const provider = getProvider(env)
  const contract = getContract(env, provider)
  const owner = await contract.owner()
  if (ethers.getAddress(owner) !== ethers.getAddress(address)) throw new Error('Not authorized: only contract owner allowed')
}

// ---------- DB/user helpers ----------
async function upsertDbUser(db: D1Database, payload: { walletAddress: string; userId: string; referrerId: string }) {
  const stmt = `INSERT INTO users (user_id, wallet_address, referrer_id, is_active)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(wallet_address) DO UPDATE SET
                  user_id = excluded.user_id,
                  referrer_id = excluded.referrer_id,
                  is_active = 1`
  await db.prepare(stmt)
    .bind(payload.userId.toUpperCase(), payload.walletAddress.toLowerCase(), payload.referrerId?.toUpperCase() || '')
    .run()
}
async function getChainProfile(env: Bindings, address: string): Promise<{ userId: string; referrerId: string; referrerAddr?: string } | null> {
  const provider = getProvider(env)
  const contract = getContract(env, provider)
  const [registered, userId, refAddr] = await Promise.all([contract.isRegistered(address), contract.addressToUserId(address), contract.referrerOf(address)])
  if (!registered || !userId) return null
  let referrerId = ''
  if (refAddr && refAddr !== ethers.ZeroAddress) { try { referrerId = await contract.addressToUserId(refAddr) } catch {} }
  return { userId, referrerId, referrerAddr: refAddr }
}
async function ensureUserInDb(env: Bindings, address: string) {
  const lower = address.toLowerCase()
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE wallet_address = ?').bind(lower).first()
  if (exists) return true
  const profile = await getChainProfile(env, address)
  if (!profile) return false
  await upsertDbUser(env.DB, { walletAddress: address, userId: profile.userId, referrerId: profile.referrerId || '' })
  return true
}
async function findUserByIdOrWallet(db: D1Database, q: { userId?: string; wallet?: string }) {
  if (q.userId) {
    return db.prepare('SELECT id, user_id, wallet_address, coin_balance, created_at FROM users WHERE user_id = ?').bind(q.userId.toUpperCase()).first()
  }
  if (q.wallet) {
    return db.prepare('SELECT id, user_id, wallet_address, coin_balance, created_at FROM users WHERE wallet_address = ?').bind(q.wallet.toLowerCase()).first()
  }
  return null
}

// ---------- Mining helpers ----------
async function computeDailyCoins(env: Bindings, amountRaw: bigint): Promise<number> {
  const { decimals } = await getTokenDecimals(env)
  const units = ethers.formatUnits(amountRaw, decimals)
  const val = Math.floor(Number(units))
  return isFinite(val) && val > 0 ? val : 0
}
async function normalizePurchaseRowIfNeeded(env: Bindings, row: { id: number; tx_hash: string; daily_coins: number }): Promise<number> {
  const weird = !row.daily_coins || row.daily_coins <= 0 || row.daily_coins > 100000
  if (!weird) return row.daily_coins
  if (!row.tx_hash) return row.daily_coins
  try {
    const provider = getProvider(env)
    const receipt = await provider.getTransactionReceipt(row.tx_hash)
    if (!receipt || receipt.status !== 1) return row.daily_coins
    const contractAddr = ethers.getAddress(env.CONTRACT_ADDRESS)
    const log = (receipt.logs || []).find((lg: any) => lg.address && ethers.getAddress(lg.address) === contractAddr && lg.topics && lg.topics[0] === MINER_PURCHASED_TOPIC)
    if (!log) return row.daily_coins
    const parsed = IFACE.parseLog({ topics: log.topics, data: log.data })
    const amountRaw = BigInt(parsed.args.amount.toString())
    const corrected = await computeDailyCoins(env, amountRaw)
    if (corrected > 0) {
      await env.DB.prepare('UPDATE mining_purchases SET daily_coins = ? WHERE id = ?').bind(corrected, row.id).run()
      return corrected
    }
  } catch (e) {
    console.warn('normalizePurchaseRowIfNeeded failed:', (e as any)?.message || e)
  }
  return row.daily_coins
}
async function creditMiningIfDue(db: D1Database, walletLower: string, env?: Bindings) {
  const res = await db
    .prepare('SELECT id, tx_hash, daily_coins, total_days, credited_days, start_date FROM mining_purchases WHERE wallet_address = ?')
    .bind(walletLower)
    .all<{ id: number; tx_hash: string; daily_coins: number; total_days: number; credited_days: number; start_date: string }>()
  const rows = res.results || []
  if (!rows.length) return { credited_coins: 0 }

  const today = todayISODate()
  let totalCoinDelta = 0
  const updates: D1PreparedStatement[] = []

  for (const r0 of rows) {
    let r = { ...r0 }
    if (env) r.daily_coins = await normalizePurchaseRowIfNeeded(env, { id: r.id, tx_hash: r.tx_hash, daily_coins: r.daily_coins })

    const maxDays = Math.max(0, Number(r.total_days || 30))
    const creditedDays = Math.max(0, Number(r.credited_days || 0))
    const dailyCoins = Math.max(0, Number(r.daily_coins || 0))

    const elapsed = daysBetweenInclusive(r.start_date, today)
    const eligibleDays = Math.min(elapsed, maxDays)
    const pendingDays = Math.max(0, eligibleDays - creditedDays)

    if (pendingDays > 0) {
      updates.push(
        db.prepare('UPDATE mining_purchases SET credited_days = credited_days + ?, last_credit_date = ? WHERE id = ?')
          .bind(pendingDays, today, r.id)
      )
      if (dailyCoins > 0) totalCoinDelta += pendingDays * dailyCoins
    }
  }

  if (updates.length) await db.batch(updates)
  if (totalCoinDelta > 0) {
    await db.prepare('UPDATE users SET coin_balance = coin_balance + ? WHERE wallet_address = ?').bind(totalCoinDelta, walletLower).run()
  }
  return { credited_coins: totalCoinDelta }
}

// ---------- Debug ----------
app.get('/api/debug/rpc', async (c) => {
  try {
    const net = await getProvider(c.env).getNetwork()
    const decInfo = await getTokenDecimals(c.env)
    return c.json({ ok: true, chainId: Number(net.chainId), contract: c.env.CONTRACT_ADDRESS, usdt: decInfo })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'rpc error' }, 500)
  }
})

// ---------- Core routes (users/login/mining, notices, admin) ----------

// Health
app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }))

// Upsert user (signed) — referral bonus
app.post('/api/users/upsert-from-chain', async (c) => {
  const cleanup = (key: string) => { inflightUpsert.delete(key); lastUpsertAt.set(key, Date.now()) }
  try {
    const body = await c.req.json<{ address: string; timestamp: number; signature: string }>()
    const { address, timestamp, signature } = body || ({} as any)
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing timestamp/signature' }, 400)

    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - Number(timestamp)) > 300) return c.json({ error: 'Signature expired' }, 400)

    const key = address.toLowerCase()
    const now = Date.now(); const last = lastUpsertAt.get(key) || 0
    if (now - last < 5000) return c.json({ ok: true, dedup: true })
    if (inflightUpsert.has(key)) return c.json({ ok: true, inflight: true })
    inflightUpsert.add(key)

    const msg = buildUserAuthMessage(address, Number(timestamp))
    await verifySignedMessage(address, msg, signature)

    const lower = address.toLowerCase()
    const existed = await c.env.DB.prepare('SELECT 1 FROM users WHERE wallet_address = ?').bind(lower).first()

    const profile = await getChainProfile(c.env, address)
    if (!profile) { cleanup(key); return c.json({ error: 'Address not registered on-chain' }, 400) }

    await upsertDbUser(c.env.DB, { walletAddress: address, userId: profile.userId, referrerId: profile.referrerId || '' })

    let referralBonus = { awarded: false, referrer: '' as string }
    if (!existed && profile.referrerAddr && profile.referrerAddr !== ethers.ZeroAddress) {
      const refLower = profile.referrerAddr.toLowerCase()
      await ensureUserInDb(c.env, profile.referrerAddr)
      const already = await c.env.DB.prepare('SELECT 1 FROM referral_rewards WHERE referred_wallet = ?').bind(lower).first()
      if (!already) {
        await c.env.DB.batch([
          c.env.DB.prepare('UPDATE users SET coin_balance = coin_balance + 5 WHERE wallet_address = ?').bind(refLower),
          c.env.DB.prepare('INSERT INTO referral_rewards (referred_wallet, referrer_id, reward_coins) VALUES (?, ?, 5)').bind(lower, (profile.referrerId || '').toUpperCase()),
        ])
        referralBonus = { awarded: true, referrer: refLower }
      }
    }

    cleanup(key)
    return c.json({ ok: true, userId: profile.userId, referrerId: profile.referrerId || '', referral_bonus: referralBonus })
  } catch (e: any) {
    console.error('POST /api/users/upsert-from-chain error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Daily login
app.post('/api/users/:address/login', async (c) => {
  try {
    const { address } = c.req.param()
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)
    const body = await c.req.json<{ timestamp: number; signature: string }>()
    const { timestamp, signature } = body || ({} as any)
    if (!timestamp || !signature) return c.json({ error: 'Missing auth params' }, 400)
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - Number(timestamp)) > 300) return c.json({ error: 'Signature expired' }, 400)
    const msg = buildUserAuthMessage(address, Number(timestamp))
    await verifySignedMessage(address, msg, signature)

    const ok = await ensureUserInDb(c.env, address)
    if (!ok) return c.json({ error: 'Address not registered on-chain' }, 400)

    const lower = address.toLowerCase()
    const loginDate = todayISODate()
    const { results } = await c.env.DB.prepare('SELECT id FROM logins WHERE wallet_address = ? AND login_date = ?').bind(lower, loginDate).all()
    if (!results || results.length === 0) {
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO logins (wallet_address, login_date) VALUES (?, ?)').bind(lower, loginDate),
        c.env.DB.prepare('UPDATE users SET coin_balance = coin_balance + 1 WHERE wallet_address = ?').bind(lower),
      ])
    }

    const miningRes = await creditMiningIfDue(c.env.DB, lower, c.env)
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?').bind(lower).first<{ cnt: number }>()

    return c.json({
      ok: true,
      total_login_days: row?.cnt || 0,
      mining_credited: miningRes.credited_coins || 0,
      today_claimed: true,
      next_reset_utc_ms: Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 0, 0, 0, 0),
    })
  } catch (e: any) {
    console.error('POST /api/users/:address/login error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Record mining purchase (signed)
app.post('/api/mining/record-purchase', async (c) => {
  try {
    const body = await c.req.json<{ address: string; tx_hash: string; timestamp: number; signature: string }>()
    const { address, tx_hash, timestamp, signature } = body || ({} as any)
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)
    if (!tx_hash || typeof tx_hash !== 'string') return c.json({ error: 'Missing tx_hash' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing auth params' }, 400)
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - Number(timestamp)) > 300) return c.json({ error: 'Signature expired' }, 400)
    const msg = buildUserAuthMessage(address, Number(timestamp))
    await verifySignedMessage(address, msg, signature)
    return await recordPurchaseInternal(c, tx_hash, address)
  } catch (e: any) {
    console.error('POST /api/mining/record-purchase error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Record mining purchase (LITE — no signature; only tx_hash)
app.post('/api/mining/record-purchase-lite', async (c) => {
  try {
    const body = await c.req.json<{ tx_hash: string }>()
    const { tx_hash } = body || ({} as any)
    if (!tx_hash || typeof tx_hash !== 'string') return c.json({ error: 'Missing tx_hash' }, 400)
    return await recordPurchaseInternal(c, tx_hash)
  } catch (e: any) {
    console.error('POST /api/mining/record-purchase-lite error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

async function recordPurchaseInternal(c: any, tx_hash: string, expectedAddress?: string) {
  const provider = getProvider(c.env)
  const receipt = await provider.getTransactionReceipt(tx_hash)
  if (!receipt || receipt.status !== 1) return c.json({ error: 'Tx not found or failed' }, 400)
  const contractAddr = ethers.getAddress(c.env.CONTRACT_ADDRESS)
  const log = (receipt.logs || []).find((lg: any) => lg.address && ethers.getAddress(lg.address) === contractAddr && lg.topics && lg.topics[0] === MINER_PURCHASED_TOPIC)
  if (!log) return c.json({ error: 'MinerPurchased event not found in tx' }, 400)
  const parsed = IFACE.parseLog({ topics: log.topics, data: log.data })
  const userAddr = ethers.getAddress(parsed.args.user as string)
  if (expectedAddress && ethers.getAddress(expectedAddress) !== userAddr) return c.json({ error: 'Event user mismatch' }, 400)

  const amountRaw = BigInt(parsed.args.amount.toString())
  const startTime = Number(parsed.args.startTime)
  const lower = userAddr.toLowerCase()

  const exists = await c.env.DB.prepare('SELECT id FROM mining_purchases WHERE tx_hash = ?').bind(tx_hash).first()
  if (exists) return c.json({ ok: true, recorded: true })

  const dailyCoins = await computeDailyCoins(c.env, amountRaw)
  const startDate = isoDateFromUnix(startTime)
  const ok = await ensureUserInDb(c.env, userAddr)
  if (!ok) return c.json({ error: 'Address not registered on-chain (db)' }, 400)

  await c.env.DB.prepare(`INSERT INTO mining_purchases (wallet_address, tx_hash, daily_coins, total_days, credited_days, start_date)
                          VALUES (?, ?, ?, 30, 0, ?)`)
    .bind(lower, tx_hash, Math.max(0, dailyCoins), startDate).run()

  const miningRes = await creditMiningIfDue(c.env.DB, lower, c.env)
  return c.json({ ok: true, daily_coins: dailyCoins, credited_now: miningRes.credited_coins || 0 })
}

// Off-chain stats
app.get('/api/stats/:address', async (c) => {
  try {
    const { address } = c.req.param()
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)
    const lower = address.toLowerCase()

    await ensureUserInDb(c.env, address)
    await creditMiningIfDue(c.env.DB, lower, c.env)

    const user = await c.env.DB.prepare('SELECT user_id, coin_balance FROM users WHERE wallet_address = ?').bind(lower).first<{ user_id: string; coin_balance: number }>()
    if (!user) return c.json({ error: 'User not found' }, 404)
    const loginRow = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?').bind(lower).first<{ cnt: number }>()
    const totalLoginDays = loginRow?.cnt || 0

    const today = todayISODate()
    const todayRow = await c.env.DB.prepare('SELECT 1 AS ok FROM logins WHERE wallet_address = ? AND login_date = ?').bind(lower, today).first<{ ok: number }>()
    const todayClaimed = !!todayRow?.ok

    return c.json({
      userId: user.user_id,
      coin_balance: user.coin_balance || 0,
      logins: { total_login_days: totalLoginDays, today_claimed: todayClaimed, today_date: today, next_reset_utc_ms: Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 0, 0, 0, 0) },
    })
  } catch (e: any) {
    console.error('GET /api/stats/:address error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// ---------- Notices (public + admin CRUD) ----------
// (Same as previous step; keep your existing notices endpoints here)

// ---------- Admin overview (Analysis) ----------
app.get('/api/admin/overview', async (c) => {
  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM users').bind().first<{ cnt: number }>()
    const totalUsers = row?.cnt || 0
    const sumRow = await c.env.DB.prepare('SELECT SUM(coin_balance) AS sumCoins FROM users').bind().first<{ sumCoins: number }>()
    const totalCoins = Number(sumRow?.sumCoins || 0)
    return c.json({ ok: true, total_users: totalUsers, total_coins: totalCoins })
  } catch (e: any) {
    console.error('GET /api/admin/overview error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// ---------- Mining history ----------
app.get('/api/mining/history/:address', async (c) => {
  try {
    const { address } = c.req.param()
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)
    const lower = address.toLowerCase()
    await ensureUserInDb(c.env, address)

    const res = await c.env.DB
      .prepare(`SELECT id, tx_hash, daily_coins, total_days, credited_days, start_date
                FROM mining_purchases WHERE wallet_address = ? ORDER BY id DESC`)
      .bind(lower).all<{ id: number; tx_hash: string; daily_coins: number; total_days: number; credited_days: number; start_date: string }>()
    const items = (res.results || []).map((r) => {
      const start = new Date(`${r.start_date}T00:00:00Z`).getTime()
      const end = start + (Number(r.total_days || 30) * 24 * 3600 * 1000)
      const now = Date.now()
      const active = now < end
      const days_left = Math.max(0, Math.ceil((end - now) / (24 * 3600 * 1000)))
      return {
        id: r.id,
        tx_hash: r.tx_hash || '',
        amount_usd: Number(r.daily_coins || 0),
        daily_coins: Number(r.daily_coins || 0),
        start_date: r.start_date,
        total_days: Number(r.total_days || 30),
        credited_days: Number(r.credited_days || 0),
        end_date: new Date(end).toISOString().slice(0, 10),
        active,
        days_left,
      }
    })
    return c.json({ items })
  } catch (e: any) {
    console.error('GET /api/mining/history/:address error:', e?.stack || e?.message || e)
    return c.json({ error: 'Server error' }, 500)
  }
})

// ---------- Admin tools: user-info + adjust-coins ----------
app.post('/api/admin/user-info', async (c) => {
  try {
    const body = await c.req.json<{ address: string; timestamp: number; signature: string; user_id?: string; wallet?: string }>()
    const { address, timestamp, signature, user_id, wallet } = body || ({} as any)
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid admin address' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing auth' }, 400)
    const msg = `Admin action authorization
Purpose: user_info
Address: ${ethers.getAddress(address)}
Timestamp: ${Number(timestamp)}`
    await verifySignedMessage(address, msg, signature)
    await requireOwner(c.env, address)

    if (!user_id && !wallet) return c.json({ error: 'user_id or wallet required' }, 400)
    const row = await findUserByIdOrWallet(c.env.DB, { userId: user_id, wallet: wallet })
    if (!row) return c.json({ error: 'User not found' }, 404)

    const lower = String(row.wallet_address).toLowerCase()
    const uid = String(row.user_id || '')
    const loginCnt = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?').bind(lower).first<{ cnt: number }>()
    const refSum = await c.env.DB.prepare('SELECT SUM(reward_coins) AS sum FROM referral_rewards WHERE referrer_id = ?').bind(uid).first<{ sum: number }>()
    const mining = await c.env.DB.prepare('SELECT COUNT(*) AS purchases, SUM(daily_coins*credited_days) AS mined FROM mining_purchases WHERE wallet_address = ?').bind(lower)
      .first<{ purchases: number; mined: number }>()
    return c.json({
      ok: true,
      user: {
        user_id: uid,
        wallet_address: lower,
        coin_balance: Number(row.coin_balance || 0),
        logins: Number(loginCnt?.cnt || 0),
        referral_coins: Number(refSum?.sum || 0),
        mining: { purchases: Number(mining?.purchases || 0), mined_coins: Number(mining?.mined || 0) },
        created_at: row.created_at,
      }
    })
  } catch (e: any) {
    console.error('POST /api/admin/user-info error:', e?.stack || e?.message || e)
    return c.json({ error: 'Server error' }, 500)
  }
})

app.post('/api/admin/adjust-coins', async (c) => {
  try {
    const body = await c.req.json<{ address: string; timestamp: number; signature: string; user_id?: string; wallet?: string; delta: number; reason?: string }>()
    const { address, timestamp, signature, user_id, wallet, delta, reason } = body || ({} as any)
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid admin address' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing auth' }, 400)
    if (!Number.isFinite(delta) || Number(delta) === 0) return c.json({ error: 'delta must be non-zero integer' }, 400)

    const msg = `Admin action authorization
Purpose: adjust_coins
Address: ${ethers.getAddress(address)}
Timestamp: ${Number(timestamp)}`
    await verifySignedMessage(address, msg, signature)
    await requireOwner(c.env, address)

    if (!user_id && !wallet) return c.json({ error: 'user_id or wallet required' }, 400)
    const row = await findUserByIdOrWallet(c.env.DB, { userId: user_id, wallet })
    if (!row) return c.json({ error: 'User not found' }, 404)
    const lower = String(row.wallet_address).toLowerCase()

    await c.env.DB.prepare('UPDATE users SET coin_balance = coin_balance + ? WHERE wallet_address = ?').bind(Math.trunc(delta), lower).run()
    await c.env.DB.prepare('INSERT INTO admin_coin_audit (wallet_address, delta, reason, admin) VALUES (?, ?, ?, ?)').bind(lower, Math.trunc(delta), (reason || '').slice(0, 200), ethers.getAddress(address)).run()
    const newRow = await c.env.DB.prepare('SELECT coin_balance FROM users WHERE wallet_address = ?').bind(lower).first<{ coin_balance: number }>()
    return c.json({ ok: true, wallet: lower, coin_balance: Number(newRow?.coin_balance || 0) })
  } catch (e: any) {
    console.error('POST /api/admin/adjust-coins error:', e?.stack || e?.message || e)
    return c.json({ error: 'Server error' }, 500)
  }
})

// ---------- Admin tools: miner add/remove (NEW) ----------
app.post('/api/admin/miner-add', async (c) => {
  try {
    const body = await c.req.json<{
      address: string
      timestamp: number
      signature: string
      wallet: string
      amount_usd: number
      start_date?: string // YYYY-MM-DD (UTC)
      total_days?: number // default 30
      tx_hash?: string // optional reference
    }>()
    const { address, timestamp, signature, wallet, amount_usd, start_date, total_days, tx_hash } = body || ({} as any)
    if (!ethers.isAddress(address) || !ethers.isAddress(wallet)) return c.json({ error: 'Invalid address' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing auth' }, 400)
    if (!Number.isFinite(amount_usd) || amount_usd <= 0) return c.json({ error: 'amount_usd must be > 0' }, 400)

    const msg = `Admin action authorization
Purpose: miner_add
Address: ${ethers.getAddress(address)}
Timestamp: ${Number(timestamp)}`
    await verifySignedMessage(address, msg, signature)
    await requireOwner(c.env, address)

    const lower = wallet.toLowerCase()
    await ensureUserInDb(c.env, wallet)

    const start = (() => {
      if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) return start_date
      return todayISODate()
    })()
    const days = Number.isFinite(total_days) && Number(total_days) > 0 ? Math.floor(Number(total_days)) : 30
    const daily = Math.floor(Number(amount_usd))

    await c.env.DB.prepare(
      `INSERT INTO mining_purchases (wallet_address, tx_hash, daily_coins, total_days, credited_days, start_date)
       VALUES (?, ?, ?, ?, 0, ?)`
    ).bind(lower, (tx_hash || ''), daily, days, start).run()

    // Catch-up immediately
    const res = await creditMiningIfDue(c.env.DB, lower, c.env)

    return c.json({ ok: true, wallet: lower, daily_coins: daily, total_days: days, start_date: start, credited_now: res.credited_coins || 0 })
  } catch (e: any) {
    console.error('POST /api/admin/miner-add error:', e?.stack || e?.message || e)
    return c.json({ error: 'Server error' }, 500)
  }
})

app.post('/api/admin/miner-remove', async (c) => {
  try {
    const body = await c.req.json<{
      address: string
      timestamp: number
      signature: string
      wallet: string
      id?: number
      tx_hash?: string
    }>()
    const { address, timestamp, signature, wallet, id, tx_hash } = body || ({} as any)
    if (!ethers.isAddress(address) || !ethers.isAddress(wallet)) return c.json({ error: 'Invalid address' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing auth' }, 400)
    if (!id && !tx_hash) return c.json({ error: 'id or tx_hash required' }, 400)

    const msg = `Admin action authorization
Purpose: miner_remove
Address: ${ethers.getAddress(address)}
Timestamp: ${Number(timestamp)}`
    await verifySignedMessage(address, msg, signature)
    await requireOwner(c.env, address)

    const lower = wallet.toLowerCase()
    const row = await c.env.DB
      .prepare(`SELECT id, daily_coins, credited_days FROM mining_purchases WHERE wallet_address = ? AND (${id ? 'id = ?' : 'tx_hash = ?'})`)
      .bind(lower, id ? Number(id) : String(tx_hash || ''))
      .first<{ id: number; daily_coins: number; credited_days: number }>()
    if (!row) return c.json({ error: 'Purchase not found' }, 404)

    const credited = Math.max(0, Number(row.daily_coins || 0)) * Math.max(0, Number(row.credited_days || 0))
    if (credited > 0) {
      // deduct from user balance (bound to 0 minimal)
      const cur = await c.env.DB.prepare('SELECT coin_balance FROM users WHERE wallet_address = ?').bind(lower).first<{ coin_balance: number }>()
      const newBal = Math.max(0, Number(cur?.coin_balance || 0) - credited)
      await c.env.DB.prepare('UPDATE users SET coin_balance = ? WHERE wallet_address = ?').bind(newBal, lower).run()
    }

    await c.env.DB.prepare('DELETE FROM mining_purchases WHERE id = ?').bind(Number(row.id)).run()

    return c.json({ ok: true, deducted: credited })
  } catch (e: any) {
    console.error('POST /api/admin/miner-remove error:', e?.stack || e?.message || e)
    return c.json({ error: 'Server error' }, 500)
  }
})

export default app
