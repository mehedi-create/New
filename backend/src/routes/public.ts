// backend/src/routes/public.ts
import { Hono } from 'hono'
import { ethers } from 'ethers'
import type { Bindings } from '../utils/types'
import { getProvider } from '../utils/chain'
import { ensureUserInDb, todayISODate } from '../utils/db'
import { creditMiningIfDue } from '../utils/mining'

export function mountPublicRoutes(app: Hono<{ Bindings: Bindings }>) {
  // Health
  app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }))

  // Debug: RPC/decimals
  app.get('/api/debug/rpc', async (c) => {
    try {
      const net = await getProvider(c.env).getNetwork()
      return c.json({ ok: true, chainId: Number(net.chainId), contract: c.env.CONTRACT_ADDRESS })
    } catch (e: any) {
      return c.json({ ok: false, error: e?.message || 'rpc error' }, 500)
    }
  })

  // Off-chain stats for a wallet
  app.get('/api/stats/:address', async (c) => {
    try {
      const { address } = c.req.param()
      if (!ethers.isAddress(address)) return c.json({ error: 'Invalid wallet address' }, 400)
      const lower = address.toLowerCase()

      await ensureUserInDb(c.env, address)
      await creditMiningIfDue(c.env.DB, lower, c.env)

      const user = await c.env.DB
        .prepare('SELECT user_id, coin_balance FROM users WHERE wallet_address = ?')
        .bind(lower)
        .first<{ user_id: string; coin_balance: number }>()
      if (!user) return c.json({ error: 'User not found' }, 404)

      const loginRow = await c.env.DB
        .prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?')
        .bind(lower)
        .first<{ cnt: number }>()
      const totalLoginDays = Number(loginRow?.cnt || 0)

      // L1 referrals from DB
      const uid = String(user.user_id || '').toUpperCase()
      let l1Count = 0
      if (uid) {
        const refCnt = await c.env.DB
          .prepare('SELECT COUNT(*) AS cnt FROM users WHERE referrer_id = ?')
          .bind(uid)
          .first<{ cnt: number }>()
        l1Count = Number(refCnt?.cnt || 0)
      }

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
          next_reset_utc_ms: Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 0, 0, 0, 0),
        },
        referrals: { l1_count: l1Count },
      })
    } catch (e: any) {
      console.error('GET /api/stats/:address error:', e?.stack || e?.message || e)
      return c.json({ error: 'Server error' }, 500)
    }
  })
}
