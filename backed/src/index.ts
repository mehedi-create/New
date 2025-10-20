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
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
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
  ]
  await db.batch(stmts.map((sql) => db.prepare(sql)))

  // columns that may not exist in older DBs
  try { await db.prepare(`ALTER TABLE users ADD COLUMN coin_balance INTEGER DEFAULT 0`).run() } catch {}
  try { await db.prepare(`ALTER TABLE notices ADD COLUMN kind TEXT DEFAULT 'text'`).run() } catch {}
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
  'event MinerPurchased(address indexed user, uint256 amount, uint256 startTime, uint256 endTime)',
]
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

// ---------- Sign/Verify helpers ----------
function buildUserAuthMessage(address: string, timestamp: number) {
  return `I authorize the backend to sync my on-chain profile.
Address: ${ethers.getAddress(address)}
Timestamp: ${timestamp}`
}
async function verifySignedMessage(expectedAddress: string, message: string, signature: string) {
  let recovered: string
  try {
    recovered = ethers.verifyMessage(message, signature)
  } catch {
    throw new Error('Invalid signature')
  }
  if (ethers.getAddress(recovered) !== ethers.getAddress(expectedAddress)) {
    throw new Error('Signature does not match address')
  }
}
async function requireOwner(env: Bindings, address: string) {
  const provider = getProvider(env)
  const contract = getContract(env, provider)
  const owner = await contract.owner()
  if (ethers.getAddress(owner) !== ethers.getAddress(address)) {
    throw new Error('Not authorized: only contract owner allowed')
  }
}

// ---------- DB helpers ----------
async function upsertDbUser(
  db: D1Database,
  payload: { walletAddress: string; userId: string; referrerId: string }
) {
  const stmt = `INSERT INTO users (user_id, wallet_address, referrer_id, is_active)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(wallet_address) DO UPDATE SET
                  user_id = excluded.user_id,
                  referrer_id = excluded.referrer_id,
                  is_active = 1`
  await db
    .prepare(stmt)
    .bind(
      payload.userId.toUpperCase(),
      payload.walletAddress.toLowerCase(),
      payload.referrerId?.toUpperCase() || '',
    )
    .run()
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}
function isoDateFromUnix(sec: number) {
  return new Date(sec * 1000).toISOString().slice(0, 10)
}
function daysBetweenInclusive(startDate: string, endDate: string) {
  const a = new Date(`${startDate}T00:00:00Z`).getTime()
  const b = new Date(`${endDate}T00:00:00Z`).getTime()
  if (isNaN(a) || isNaN(b)) return 0
  const diffDays = Math.floor((b - a) / (24 * 3600 * 1000))
  return diffDays < 0 ? 0 : diffDays + 1
}
function nextUtcMidnightMs() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
}

// ---------- Chain profile helpers ----------
async function getChainProfile(env: Bindings, address: string): Promise<{ userId: string; referrerId: string; referrerAddr?: string } | null> {
  const provider = getProvider(env)
  const contract = getContract(env, provider)
  const [registered, userId, refAddr] = await Promise.all([
    contract.isRegistered(address),
    contract.addressToUserId(address),
    contract.referrerOf(address),
  ])
  if (!registered || !userId) return null
  let referrerId = ''
  if (refAddr && refAddr !== ethers.ZeroAddress) {
    try { referrerId = await contract.addressToUserId(refAddr) } catch {}
  }
  return { userId, referrerId, referrerAddr: refAddr }
}

async function ensureUserInDb(env: Bindings, address: string) {
  const lower = address.toLowerCase()
  const exists = await env.DB
    .prepare('SELECT 1 FROM users WHERE wallet_address = ?')
    .bind(lower)
    .first()
  if (exists) return true
  const profile = await getChainProfile(env, address)
  if (!profile) return false
  await upsertDbUser(env.DB, {
    walletAddress: address,
    userId: profile.userId,
    referrerId: profile.referrerId || '',
  })
  return true
}

// ---------- Mining helpers ----------
function coinsFromAmountRaw(raw: bigint): number {
  // Works for 6 or 18 decimals; take the larger integer
  const c18 = Number(raw / 10n ** 18n)
  const c6 = Number(raw / 10n ** 6n)
  return Math.max(c18, c6)
}

async function creditMiningIfDue(db: D1Database, walletLower: string) {
  const res = await db
    .prepare('SELECT id, daily_coins, total_days, credited_days, start_date FROM mining_purchases WHERE wallet_address = ?')
    .bind(walletLower)
    .all<{ id: number; daily_coins: number; total_days: number; credited_days: number; start_date: string }>()
  const rows = res.results || []
  if (!rows.length) return { credited_coins: 0 }

  const today = todayISODate()
  let totalCoinDelta = 0
  const updates: D1PreparedStatement[] = []

  for (const r of rows) {
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
      if (dailyCoins > 0) {
        totalCoinDelta += pendingDays * dailyCoins
      }
    }
  }

  if (updates.length) {
    await db.batch(updates)
  }
  if (totalCoinDelta > 0) {
    await db
      .prepare('UPDATE users SET coin_balance = coin_balance + ? WHERE wallet_address = ?')
      .bind(totalCoinDelta, walletLower)
      .run()
  }
  return { credited_coins: totalCoinDelta }
}

// ---------- Debug endpoints ----------
app.get('/api/debug/rpc', async (c) => {
  try {
    const net = await getProvider(c.env).getNetwork()
    return c.json({ ok: true, chainId: Number(net.chainId), contract: c.env.CONTRACT_ADDRESS })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'rpc error' }, 500)
  }
})
app.get('/api/debug/contract', async (c) => {
  try {
    const owner = await getContract(c.env, getProvider(c.env)).owner()
    return c.json({ ok: true, owner })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'contract error' }, 500)
  }
})
app.get('/api/debug/chain/:address', async (c) => {
  const { address } = c.req.param()
  if (!ethers.isAddress(address)) return c.json({ error: 'Invalid address' }, 400)
  try {
    const p = await getChainProfile(c.env, address)
    if (!p) return c.json({ registered: false })
    return c.json({ registered: true, ...p })
  } catch (e: any) {
    return c.json({ error: e?.message || 'chain error' }, 500)
  }
})
app.get('/api/debug/db/:address', async (c) => {
  const { address } = c.req.param()
  if (!ethers.isAddress(address)) return c.json({ error: 'Invalid address' }, 400)
  try {
    const row = await c.env.DB
      .prepare('SELECT user_id, wallet_address FROM users WHERE wallet_address = ?')
      .bind(address.toLowerCase())
      .first()
    return c.json({ exists: !!row, user: row || null })
  } catch (e: any) {
    return c.json({ error: e?.message || 'db error' }, 500)
  }
})

// ---------- API Routes ----------

// Health
app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }))

// Upsert user (signed) — includes referral bonus (+5) on first insert
app.post('/api/users/upsert-from-chain', async (c) => {
  const cleanup = (key: string) => {
    inflightUpsert.delete(key)
    lastUpsertAt.set(key, Date.now())
  }
  try {
    const body = await c.req.json<{ address: string; timestamp: number; signature: string }>()
    const { address, timestamp, signature } = body || ({} as any)
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing timestamp/signature' }, 400)

    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - Number(timestamp)) > 300) {
      return c.json({ error: 'Signature expired' }, 400)
    }

    const key = address.toLowerCase()
    const now = Date.now()
    const last = lastUpsertAt.get(key) || 0
    if (now - last < 5000) {
      return c.json({ ok: true, dedup: true })
    }
    if (inflightUpsert.has(key)) {
      return c.json({ ok: true, inflight: true })
    }
    inflightUpsert.add(key)

    const msg = buildUserAuthMessage(address, Number(timestamp))
    await verifySignedMessage(address, msg, signature)

    const lower = address.toLowerCase()
    const existed = await c.env.DB
      .prepare('SELECT 1 FROM users WHERE wallet_address = ?')
      .bind(lower)
      .first()

    const profile = await getChainProfile(c.env, address)
    if (!profile) { cleanup(key); return c.json({ error: 'Address not registered on-chain' }, 400) }

    await upsertDbUser(c.env.DB, {
      walletAddress: address,
      userId: profile.userId,
      referrerId: profile.referrerId || '',
    })

    let referralBonus = { awarded: false, referrer: '' as string }
    if (!existed && profile.referrerAddr && profile.referrerAddr !== ethers.ZeroAddress) {
      const refLower = profile.referrerAddr.toLowerCase()
      await ensureUserInDb(c.env, profile.referrerAddr)
      const already = await c.env.DB
        .prepare('SELECT 1 FROM referral_rewards WHERE referred_wallet = ?')
        .bind(lower)
        .first()
      if (!already) {
        await c.env.DB.batch([
          c.env.DB.prepare('UPDATE users SET coin_balance = coin_balance + 5 WHERE wallet_address = ?').bind(refLower),
          c.env.DB.prepare('INSERT INTO referral_rewards (referred_wallet, referrer_id, reward_coins) VALUES (?, ?, 5)')
            .bind(lower, (profile.referrerId || '').toUpperCase()),
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

// Daily login (signed) → +1 coin/day + mining catch-up
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
    const { results } = await c.env.DB
      .prepare('SELECT id FROM logins WHERE wallet_address = ? AND login_date = ?')
      .bind(lower, loginDate)
      .all()

    if (!results || results.length === 0) {
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO logins (wallet_address, login_date) VALUES (?, ?)').bind(lower, loginDate),
        c.env.DB.prepare('UPDATE users SET coin_balance = coin_balance + 1 WHERE wallet_address = ?').bind(lower),
      ])
    }

    const miningRes = await creditMiningIfDue(c.env.DB, lower)

    const row = await c.env.DB
      .prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?')
      .bind(lower)
      .first<{ cnt: number }>()

    return c.json({
      ok: true,
      total_login_days: row?.cnt || 0,
      mining_credited: miningRes.credited_coins || 0,
      today_claimed: true,
      next_reset_utc_ms: nextUtcMidnightMs(),
    })
  } catch (e: any) {
    console.error('POST /api/users/:address/login error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Record mining purchase (signed) — verify tx log → save purchase
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

    const lower = address.toLowerCase()

    const exists = await c.env.DB
      .prepare('SELECT id FROM mining_purchases WHERE tx_hash = ?')
      .bind(tx_hash)
      .first()
    if (exists) return c.json({ ok: true, recorded: true })

    const provider = getProvider(c.env)
    const receipt = await provider.getTransactionReceipt(tx_hash)
    if (!receipt || receipt.status !== 1) return c.json({ error: 'Tx not found or failed' }, 400)

    const contractAddr = ethers.getAddress(c.env.CONTRACT_ADDRESS)
    const log = (receipt.logs || []).find((lg: any) =>
      lg.address && ethers.getAddress(lg.address) === contractAddr && lg.topics && lg.topics[0] === MINER_PURCHASED_TOPIC
    )
    if (!log) return c.json({ error: 'MinerPurchased event not found in tx' }, 400)

    const parsed = IFACE.parseLog({ topics: log.topics, data: log.data })
    const userAddr = ethers.getAddress(parsed.args.user as string)
    const amountRaw = BigInt(parsed.args.amount.toString())
    const startTime = Number(parsed.args.startTime)

    if (ethers.getAddress(userAddr) !== ethers.getAddress(address)) {
      return c.json({ error: 'Event user mismatch' }, 400)
    }

    const dailyCoins = coinsFromAmountRaw(amountRaw)
    const startDate = isoDateFromUnix(startTime)

    const ok = await ensureUserInDb(c.env, address)
    if (!ok) return c.json({ error: 'Address not registered on-chain (db)' }, 400)

    await c.env.DB
      .prepare(`INSERT INTO mining_purchases (wallet_address, tx_hash, daily_coins, total_days, credited_days, start_date)
                VALUES (?, ?, ?, 30, 0, ?)`)
      .bind(lower, tx_hash, Math.max(0, dailyCoins), startDate)
      .run()

    const miningRes = await creditMiningIfDue(c.env.DB, lower)

    return c.json({ ok: true, daily_coins: dailyCoins, credited_now: miningRes.credited_coins || 0 })
  } catch (e: any) {
    console.error('POST /api/mining/record-purchase error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Off-chain stats (includes mining catch-up + today's claim status)
app.get('/api/stats/:address', async (c) => {
  try {
    const { address } = c.req.param()
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)

    const lower = address.toLowerCase()

    await ensureUserInDb(c.env, address)
    await creditMiningIfDue(c.env.DB, lower)

    const user = await c.env.DB
      .prepare('SELECT user_id, coin_balance FROM users WHERE wallet_address = ?')
      .bind(lower)
      .first<{ user_id: string; coin_balance: number }>()
    if (!user) return c.json({ error: 'User not found' }, 404)

    const loginRow = await c.env.DB
      .prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?')
      .bind(lower)
      .first<{ cnt: number }>()
    const totalLoginDays = loginRow?.cnt || 0

    const today = todayISODate()
    const todayRow = await c.env.DB
      .prepare('SELECT 1 AS ok FROM logins WHERE wallet_address = ? AND login_date = ?')
      .bind(lower, today)
      .first<{ ok: number }>()
    const todayClaimed = !!todayRow?.ok

    return c.json({
      userId: user.user_id,
      coin_balance: user.coin_balance || 0,
      logins: {
        total_login_days: totalLoginDays,
        today_claimed: todayClaimed,
        today_date: today,
        next_reset_utc_ms: nextUtcMidnightMs(),
      },
    })
  } catch (e: any) {
    console.error('GET /api/stats/:address error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Notices: Public list
app.get('/api/notices', async (c) => {
  try {
    const url = new URL(c.req.url)
    const limit = Math.min(Number(url.searchParams.get('limit') || '10'), 50)
    const onlyActive = url.searchParams.get('active') !== '0'

    const where = onlyActive ? 'WHERE is_active = 1' : ''
    const stmt = `SELECT id, title, content_html, image_url, link_url, kind, priority, created_at
                  FROM notices ${where} ORDER BY priority DESC, id DESC LIMIT ?`
    const res = await c.env.DB.prepare(stmt).bind(limit).all()

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
    })
  } catch (e: any) {
    console.error('GET /api/notices error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Notices: create (owner only)
app.post('/api/notices', async (c) => {
  try {
    const body = await c.req.json<{
      address: string
      timestamp: number
      signature: string
      title?: string
      content_html?: string
      image_url?: string
      link_url?: string
      is_active?: boolean
      priority?: number
      kind?: 'image' | 'text' | 'script'
    }>()
    const { address, timestamp, signature } = body || ({} as any)
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid address' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing auth params' }, 400)

    const msg = `Admin action authorization
Purpose: create_notice
Address: ${ethers.getAddress(address)}
Timestamp: ${Number(timestamp)}`
    await verifySignedMessage(address, msg, signature)
    await requireOwner(c.env, address)

    const title = (body.title || '').trim()
    const kind = (body.kind || 'text') as 'image' | 'text' | 'script'
    const is_active = body.is_active === false ? 0 : 1
    const priority = Number.isFinite(body.priority) ? Number(body.priority) : 0
    const image_url = kind === 'image' ? (body.image_url || '') : ''
    const link_url = kind === 'image' ? (body.link_url || '') : ''
    const content_html =
      kind === 'text' ? (body.content_html || '') :
      kind === 'script' ? (body.content_html || '') : ''

    await c.env.DB.prepare(
      `INSERT INTO notices (title, content_html, image_url, link_url, kind, is_active, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(title, content_html, image_url, link_url, kind, is_active, priority, new Date().toISOString())
      .run()

    return c.json({ ok: true })
  } catch (e: any) {
    console.error('POST /api/notices error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Notices: update (owner only)
app.patch('/api/notices/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const body = await c.req.json<{
      address: string
      timestamp: number
      signature: string
      title?: string
      content_html?: string
      image_url?: string
      link_url?: string
      is_active?: boolean
      priority?: number
      kind?: 'image' | 'text' | 'script'
    }>()
    const { address, timestamp, signature } = body || ({} as any)
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid address' }, 400)
    if (!timestamp || !signature) return c.json({ error: 'Missing auth params' }, 400)

    const msg = `Admin action authorization
Purpose: update_notice
Address: ${ethers.getAddress(address)}
Timestamp: ${Number(timestamp)}`
    await verifySignedMessage(address, msg, signature)
    await requireOwner(c.env, address)

    const fields: string[] = []
    const values: any[] = []
    if (typeof body.title === 'string') { fields.push('title = ?'); values.push(body.title.trim()) }
    if (typeof body.content_html === 'string') { fields.push('content_html = ?'); values.push(body.content_html) }
    if (typeof body.image_url === 'string') { fields.push('image_url = ?'); values.push(body.image_url) }
    if (typeof body.link_url === 'string') { fields.push('link_url = ?'); values.push(body.link_url) }
    if (typeof body.priority === 'number') { fields.push('priority = ?'); values.push(Number(body.priority)) }
    if (typeof body.is_active === 'boolean') { fields.push('is_active = ?'); values.push(body.is_active ? 1 : 0) }
    if (typeof body.kind === 'string' && ['image', 'text', 'script'].includes(body.kind)) {
      fields.push('kind = ?'); values.push(body.kind)
    }
    fields.push('updated_at = ?'); values.push(new Date().toISOString())

    if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)
    const sql = `UPDATE notices SET ${fields.join(', ')} WHERE id = ?`
    values.push(Number(id))
    await c.env.DB.prepare(sql).bind(...values).run()

    return c.json({ ok: true })
  } catch (e: any) {
    console.error('PATCH /api/notices/:id error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// ---------- Admin stats ----------
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

app.get('/api/admin/top-referrers', async (c) => {
  try {
    const url = new URL(c.req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '10'), 1), 50)
    const res = await c.env.DB.prepare(
      `SELECT u.referrer_id AS user_id, u2.wallet_address AS address, COUNT(*) AS referrals
       FROM users u
       LEFT JOIN users u2 ON u2.user_id = u.referrer_id
       WHERE u.referrer_id IS NOT NULL AND u.referrer_id <> ''
       GROUP BY u.referrer_id
       ORDER BY referrals DESC
       LIMIT ?`
    ).bind(limit).all<{ user_id: string; address: string | null; referrals: number }>()
    const list = (res.results || []).map(r => ({
      address: (r.address || '').toLowerCase(),
      userId: (r.user_id || '').toUpperCase(),
      count: Number(r.referrals || 0),
    }))
    return c.json({ ok: true, top: list })
  } catch (e: any) {
    console.error('GET /api/admin/top-referrers error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

export default app
