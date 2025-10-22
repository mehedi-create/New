// backend/src/routes/mining.ts
import { Hono } from 'hono'
import { ethers } from 'ethers'
import type { Bindings } from '../utils/types'
import {
  getProvider,
  IFACE,
  MINER_PURCHASED_TOPIC,
} from '../utils/chain'
import { buildUserAuthMessage, verifySignedMessage } from '../utils/auth'
import {
  ensureUserInDb,
  isoDateFromUnix,
} from '../utils/db'
import { computeDailyCoins } from '../utils/chain'
import { creditMiningIfDue } from '../utils/mining'

async function recordPurchaseInternal(c: any, tx_hash: string, expectedAddress?: string) {
  const provider = getProvider(c.env)
  const receipt = await provider.getTransactionReceipt(tx_hash)
  if (!receipt || receipt.status !== 1) return c.json({ error: 'Tx not found or failed' }, 400)
  const contractAddr = ethers.getAddress(c.env.CONTRACT_ADDRESS)
  const log = (receipt.logs || []).find(
    (lg: any) =>
      lg.address &&
      ethers.getAddress(lg.address) === contractAddr &&
      lg.topics &&
      lg.topics[0] === MINER_PURCHASED_TOPIC
  )
  if (!log) return c.json({ error: 'MinerPurchased event not found in tx' }, 400)
  const parsed = IFACE.parseLog({ topics: log.topics, data: log.data })
  const userAddr = ethers.getAddress(parsed.args.user as string)
  if (expectedAddress && ethers.getAddress(expectedAddress) !== userAddr) {
    return c.json({ error: 'Event user mismatch' }, 400)
  }

  const amountRaw = BigInt(parsed.args.amount.toString())
  const startTime = Number(parsed.args.startTime)
  const lower = userAddr.toLowerCase()

  const exists = await c.env.DB.prepare('SELECT id FROM mining_purchases WHERE tx_hash = ?').bind(tx_hash).first()
  if (exists) return c.json({ ok: true, recorded: true })

  const dailyCoins = await computeDailyCoins(c.env, amountRaw)
  const startDate = isoDateFromUnix(startTime)
  const ok = await ensureUserInDb(c.env, userAddr)
  if (!ok) return c.json({ error: 'Address not registered on-chain (db)' }, 400)

  await c.env.DB.prepare(
    `INSERT INTO mining_purchases (wallet_address, tx_hash, daily_coins, total_days, credited_days, start_date)
     VALUES (?, ?, ?, 30, 0, ?)`
  ).bind(lower, tx_hash, Math.max(0, dailyCoins), startDate).run()

  const miningRes = await creditMiningIfDue(c.env.DB, lower, c.env)
  return c.json({ ok: true, daily_coins: dailyCoins, credited_now: miningRes.credited_coins || 0 })
}

export function mountMiningRoutes(app: Hono<{ Bindings: Bindings }>) {
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
      console.error('POST /api/mining/record-purchase error:', e?.stack || e?.message)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // Record mining purchase (LITE — only tx_hash)
  app.post('/api/mining/record-purchase-lite', async (c) => {
    try {
      const body = await c.req.json<{ tx_hash: string }>()
      const { tx_hash } = body || ({} as any)
      if (!tx_hash || typeof tx_hash !== 'string') return c.json({ error: 'Missing tx_hash' }, 400)
      return await recordPurchaseInternal(c, tx_hash)
    } catch (e: any) {
      console.error('POST /api/mining/record-purchase-lite error:', e?.stack || e?.message)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // Mining history
  app.get('/api/mining/history/:address', async (c) => {
    try {
      const { address } = c.req.param()
      if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)
      const lower = address.toLowerCase()
      await ensureUserInDb(c.env, address)

      const res = await c.env.DB
        .prepare(`SELECT id, tx_hash, daily_coins, total_days, credited_days, start_date
                  FROM mining_purchases WHERE wallet_address = ? ORDER BY id DESC`)
        .bind(lower)
        .all<{ id: number; tx_hash: string; daily_coins: number; total_days: number; credited_days: number; start_date: string }>()
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
}
