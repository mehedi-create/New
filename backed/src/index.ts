// backend/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ethers, JsonRpcProvider, Contract } from 'ethers'

// ---------- Env Bindings ----------
type Bindings = {
  DB: D1Database
  ALLOWED_ORIGINS: string
  BSC_RPC_URL?: string
  CONTRACT_ADDRESS: string
}

const app = new Hono<{ Bindings: Bindings }>()

// in-memory light guards
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
]

function getProvider(env: Bindings): JsonRpcProvider {
  const url = env.BSC_RPC_URL
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

// ---------- Chain profile helpers ----------
async function getChainProfile(env: Bindings, address: string): Promise<{ userId: string; referrerId: string } | null> {
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
  return { userId, referrerId }
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

// ---------- API Routes ----------

// Health
app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }))

// Upsert user (signed) — idempotent (no 409 on inflight)
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
      return c.json({ error: 'Signature expired, please try again.' }, 400)
    }

    // light rate-limit + inflight dedup (return 200 instead of 429/409)
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

    const profile = await getChainProfile(c.env, address)
    if (!profile) { cleanup(key); return c.json({ error: 'Address not registered on-chain' }, 400) }

    await upsertDbUser(c.env.DB, {
      walletAddress: address,
      userId: profile.userId,
      referrerId: profile.referrerId || '',
    })

    cleanup(key)
    return c.json({ ok: true, userId: profile.userId, referrerId: profile.referrerId || '' })
  } catch (e: any) {
    console.error('POST /api/users/upsert-from-chain error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Daily login (signed) → +1 coin/day (auto-ensure user in DB)
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

    // Ensure user exists in DB (fetch from chain if needed)
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
        c.env.DB.prepare('INSERT INTO logins (wallet_address, login_date) VALUES (?, ?)').bind(
          lower,
          loginDate
        ),
        c.env.DB
          .prepare('UPDATE users SET coin_balance = coin_balance + 1 WHERE wallet_address = ?')
          .bind(lower),
      ])
    }

    const row = await c.env.DB
      .prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?')
      .bind(lower)
      .first<{ cnt: number }>()

    return c.json({ ok: true, total_login_days: row?.cnt || 0 })
  } catch (e: any) {
    console.error('POST /api/users/:address/login error:', e.stack || e.message)
    return c.json({ error: 'Server error' }, 500)
  }
})

// Off-chain stats
app.get('/api/stats/:address', async (c) => {
  try {
    const { address } = c.req.param()
    if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)

    const lower = address.toLowerCase()
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

    return c.json({
      userId: user.user_id,
      coin_balance: user.coin_balance || 0,
      logins: { total_login_days: totalLoginDays },
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

    // simple verify
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

export default app
