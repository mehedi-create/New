// backend/src/routes/user.ts
import { Hono } from 'hono'
import { ethers } from 'ethers'
import type { Bindings } from '../utils/types'
import { getProvider, IFACE, REG_TOPICS, REG_IFACES } from '../utils/chain'
import { buildUserAuthMessage, verifySignedMessage } from '../utils/auth'
import {
  getChainProfile,
  upsertDbUser,
  ensureUserInDb,
  todayISODate,
} from '../utils/db'
import { creditMiningIfDue } from '../utils/mining'

// per-worker memory guards (dedupe upsert)
const inflightUpsert = new Set<string>()
const lastUpsertAt = new Map<string, number>()

export function mountUserRoutes(app: Hono<{ Bindings: Bindings }>) {
  // Upsert user (signed) — referral bonus (for backward compat)
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
      console.error('POST /api/users/upsert-from-chain error:', e?.stack || e?.message)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // Register-lite (no signature; only tx_hash) — parse UserRegistered event and sync DB
  app.post('/api/users/register-lite', async (c) => {
    try {
      const body = await c.req.json<{ tx_hash: string }>()
      const { tx_hash } = body || ({} as any)
      if (!tx_hash || typeof tx_hash !== 'string') return c.json({ error: 'Missing tx_hash' }, 400)

      const provider = getProvider(c.env)
      const receipt = await provider.getTransactionReceipt(tx_hash)
      if (!receipt || receipt.status !== 1) return c.json({ error: 'Tx not found or failed' }, 400)

      const logs = (receipt.logs || []).filter((lg: any) => lg.address)
      let userAddr: string | null = null
      // Prefer topic pre-filter
      for (const lg of logs) {
        if (!lg.topics || !lg.topics.length) continue
        if (!REG_TOPICS.includes(lg.topics[0])) continue
        for (const I of REG_IFACES) {
          try {
            const parsed = I.parseLog({ topics: lg.topics, data: lg.data })
            const u = parsed?.args?.user as string
            if (u && ethers.isAddress(u)) { userAddr = ethers.getAddress(u); break }
          } catch {}
        }
        if (userAddr) break
      }
      // Fallback: try parsing all logs with all IFACES
      if (!userAddr) {
        for (const lg of logs) {
          for (const I of REG_IFACES) {
            try {
              const parsed = I.parseLog({ topics: lg.topics, data: lg.data })
              const u = parsed?.args?.user as string
              if (u && ethers.isAddress(u)) { userAddr = ethers.getAddress(u); break }
            } catch {}
          }
          if (userAddr) break
        }
      }
      if (!userAddr) return c.json({ error: 'UserRegistered event not found in tx' }, 400)

      const lower = userAddr.toLowerCase()
      const existed = await c.env.DB.prepare('SELECT 1 FROM users WHERE wallet_address = ?').bind(lower).first()

      const profile = await getChainProfile(c.env, userAddr)
      if (!profile) return c.json({ error: 'Address not registered on-chain' }, 400)

      await upsertDbUser(c.env.DB, { walletAddress: userAddr, userId: profile.userId, referrerId: profile.referrerId || '' })

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

      return c.json({ ok: true, user: { address: lower, userId: profile.userId, referrerId: profile.referrerId || '' }, referral_bonus: referralBonus })
    } catch (e: any) {
      console.error('POST /api/users/register-lite error:', e?.stack || e?.message || e)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // Daily login (signed)
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

      const miningRes = await creditMiningIfDue(c.env.DB, lower, c.env)
      const row = await c.env.DB
        .prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?')
        .bind(lower)
        .first<{ cnt: number }>()

      return c.json({
        ok: true,
        total_login_days: row?.cnt || 0,
        mining_credited: miningRes.credited_coins || 0,
        today_claimed: true,
        next_reset_utc_ms: Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 0, 0, 0, 0),
      })
    } catch (e: any) {
      console.error('POST /api/users/:address/login error:', e?.stack || e?.message)
      return c.json({ error: 'Server error' }, 500)
    }
  })
}
