// backend/src/routes/admin.ts
import { Hono } from 'hono'
import { ethers } from 'ethers'
import type { Bindings } from '../utils/types'
import {
  buildAdminActionMessage,
  verifySignedMessage,
  requireOwner,
} from '../utils/auth'
import {
  findUserByIdOrWallet,
  ensureUserInDb,
} from '../utils/db'
import {
  getProvider,
  IFACE,
  MINER_PURCHASED_TOPIC,
  computeDailyCoins,
} from '../utils/chain'
import {
  creditMiningIfDue,
  importMinerPurchasesFromLogs,
  normalizeMinersForWallet,
  computeExpectedBalanceForUser,
} from '../utils/mining'

// -------- Helpers --------
async function requireAdminAuth(c: any, purpose: string, body: any) {
  const { address, timestamp, signature } = body || ({} as any)
  if (!ethers.isAddress(address)) return { error: 'Invalid admin address' }
  if (!timestamp || !signature) return { error: 'Missing auth' }

  const msg = buildAdminActionMessage(purpose, address, Number(timestamp))
  await verifySignedMessage(address, msg, signature)
  await requireOwner(c.env, address)
  return { ok: true }
}

export function mountAdminRoutes(app: Hono<{ Bindings: Bindings }>) {
  // ---- Overview ----
  app.get('/api/admin/overview', async (c) => {
    try {
      const row = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM users').bind().first<{ cnt: number }>()
      const sumRow = await c.env.DB.prepare('SELECT SUM(coin_balance) AS sumCoins FROM users').bind().first<{ sumCoins: number }>()
      return c.json({ ok: true, total_users: Number(row?.cnt || 0), total_coins: Number(sumRow?.sumCoins || 0) })
    } catch (e: any) {
      console.error('GET /api/admin/overview error:', e?.stack || e?.message)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // ---- User info (l1_count + mining totals) ----
  app.post('/api/admin/user-info', async (c) => {
    try {
      const body = await c.req.json<{ address: string; timestamp: number; signature: string; user_id?: string; wallet?: string }>()
      const auth = await requireAdminAuth(c, 'user_info', body)
      if ((auth as any).error) return c.json(auth, 400)

      const { user_id, wallet } = body || ({} as any)
      if (!user_id && !wallet) return c.json({ error: 'user_id or wallet required' }, 400)

      const row = await findUserByIdOrWallet(c.env.DB, { userId: user_id, wallet })
      if (!row) return c.json({ error: 'User not found' }, 404)

      const lower = String(row.wallet_address).toLowerCase()
      const uid = String(row.user_id || '').toUpperCase()

      const loginCnt = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?').bind(lower).first<{ cnt: number }>()
      const refSum = await c.env.DB.prepare('SELECT SUM(reward_coins) AS sum FROM referral_rewards WHERE referrer_id = ?').bind(uid).first<{ sum: number }>()
      const l1Cnt = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM users WHERE referrer_id = ?').bind(uid).first<{ cnt: number }>()
      const mining = await c.env.DB.prepare('SELECT COUNT(*) AS purchases, SUM(daily_coins*credited_days) AS mined FROM mining_purchases WHERE wallet_address = ?').bind(lower)
        .first<{ purchases: number; mined: number }>()
      const miningAdj = await c.env.DB.prepare('SELECT SUM(delta) AS sum FROM mining_adjustments WHERE wallet_address = ?').bind(lower).first<{ sum: number }>()

      const minedBase = Number(mining?.mined || 0)
      const minedAdj = Number(miningAdj?.sum || 0)

      return c.json({
        ok: true,
        user: {
          user_id: uid,
          wallet_address: lower,
          coin_balance: Number(row.coin_balance || 0),
          logins: Number(loginCnt?.cnt || 0),
          referral_coins: Number(refSum?.sum || 0),
          l1_count: Number(l1Cnt?.cnt || 0),
          mining: {
            purchases: Number(mining?.purchases || 0),
            mined_coins: minedBase,
            adjustments: minedAdj,
            mining_total: minedBase + minedAdj,
          },
          created_at: row.created_at,
        }
      })
    } catch (e: any) {
      console.error('POST /api/admin/user-info error:', e?.stack || e?.message)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // ---- Adjust coins (manual) ----
  app.post('/api/admin/adjust-coins', async (c) => {
    try {
      const body = await c.req.json<{ address: string; timestamp: number; signature: string; user_id?: string; wallet?: string; delta: number; reason?: string }>()
      const auth = await requireAdminAuth(c, 'adjust_coins', body)
      if ((auth as any).error) return c.json(auth, 400)

      const { user_id, wallet, delta, reason } = body || ({} as any)
      if (!Number.isFinite(delta) || Number(delta) === 0) return c.json({ error: 'delta must be non-zero integer' }, 400)
      if (!user_id && !wallet) return c.json({ error: 'user_id or wallet required' }, 400)

      const row = await findUserByIdOrWallet(c.env.DB, { userId: user_id, wallet })
      if (!row) return c.json({ error: 'User not found' }, 404)
      const lower = String(row.wallet_address).toLowerCase()

      await c.env.DB.prepare('UPDATE users SET coin_balance = coin_balance + ? WHERE wallet_address = ?').bind(Math.trunc(delta), lower).run()
      await c.env.DB.prepare('INSERT INTO admin_coin_audit (wallet_address, delta, reason, admin) VALUES (?, ?, ?, ?)').bind(lower, Math.trunc(delta), (reason || '').slice(0, 200), ethers.getAddress(body.address)).run()
      const newRow = await c.env.DB.prepare('SELECT coin_balance FROM users WHERE wallet_address = ?').bind(lower).first<{ coin_balance: number }>()
      return c.json({ ok: true, wallet: lower, coin_balance: Number(newRow?.coin_balance || 0) })
    } catch (e: any) {
      console.error('POST /api/admin/adjust-coins error:', e?.stack || e?.message)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // ---- Add miner (verify/force) ----
  app.post('/api/admin/miner-add', async (c) => {
    try {
      const body = await c.req.json<{
        address: string
        timestamp: number
        signature: string
        wallet: string
        mode?: 'verify' | 'force'
        amount_usd?: number
        start_date?: string
        total_days?: number
        tx_hash?: string
      }>()
      const auth = await requireAdminAuth(c, 'miner_add', body)
      if ((auth as any).error) return c.json(auth, 400)

      const { wallet, mode = 'verify', amount_usd, start_date, total_days, tx_hash } = body || ({} as any)
      if (!ethers.isAddress(wallet)) return c.json({ error: 'Invalid wallet' }, 400)
      const lower = wallet.toLowerCase()
      await ensureUserInDb(c.env, wallet)

      let daily = 0
      let start = ''
      const days = Number.isFinite(total_days) && Number(total_days) > 0 ? Math.floor(Number(total_days)) : 30

      if (mode === 'verify') {
        if (!tx_hash || typeof tx_hash !== 'string') return c.json({ error: 'tx_hash required in verify mode' }, 400)
        const provider = getProvider(c.env)
        const receipt = await provider.getTransactionReceipt(tx_hash)
        if (!receipt || receipt.status !== 1) return c.json({ error: 'Tx not found or failed' }, 400)
        const log = (receipt.logs || []).find(
          (lg: any) =>
            lg.address &&
            ethers.getAddress(lg.address) === ethers.getAddress(c.env.CONTRACT_ADDRESS) &&
            lg.topics &&
            lg.topics[0] === MINER_PURCHASED_TOPIC
        )
        if (!log) return c.json({ error: 'MinerPurchased event not found in tx' }, 400)
        const parsed = IFACE.parseLog({ topics: log.topics, data: log.data })
        const userAddr = ethers.getAddress(parsed.args.user as string)
        if (userAddr.toLowerCase() !== lower) return c.json({ error: 'Event user mismatch' }, 400)
        const amountRaw = BigInt(parsed.args.amount.toString())
        daily = await computeDailyCoins(c.env, amountRaw)
        start = new Date(Number(parsed.args.startTime) * 1000).toISOString().slice(0, 10)
      } else {
        // force mode
        if (!Number.isFinite(amount_usd) || Number(amount_usd) <= 0) return c.json({ error: 'amount_usd must be > 0' }, 400)
        daily = Math.floor(Number(amount_usd))
        start = (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) ? start_date : new Date().toISOString().slice(0, 10)
      }

      const exists = tx_hash ? await c.env.DB.prepare('SELECT id FROM mining_purchases WHERE tx_hash = ?').bind(tx_hash).first() : null
      if (exists) return c.json({ ok: true, recorded: true, note: 'duplicate_tx' })

      await c.env.DB.prepare(
        `INSERT INTO mining_purchases (wallet_address, tx_hash, daily_coins, total_days, credited_days, start_date)
         VALUES (?, ?, ?, ?, 0, ?)`
      ).bind(lower, (tx_hash || ''), daily, days, start).run()

      const res = await creditMiningIfDue(c.env.DB, lower, c.env)
      return c.json({ ok: true, wallet: lower, daily_coins: daily, total_days: days, start_date: start, credited_now: res.credited_coins || 0, mode })
    } catch (e: any) {
      console.error('POST /api/admin/miner-add error:', e?.stack || e?.message)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // ---- Remove miner (delete) ----
  app.post('/api/admin/miner-remove', async (c) => {
    try {
      const body = await c.req.json<{ address: string; timestamp: number; signature: string; wallet: string; id?: number; tx_hash?: string }>()
      const auth = await requireAdminAuth(c, 'miner_remove', body)
      if ((auth as any).error) return c.json(auth, 400)

      const { wallet, id, tx_hash } = body || ({} as any)
      if (!ethers.isAddress(wallet)) return c.json({ error: 'Invalid wallet' }, 400)
      if (!id && !tx_hash) return c.json({ error: 'id or tx_hash required' }, 400)

      const lower = wallet.toLowerCase()
      const row = await c.env.DB
        .prepare(`SELECT id, daily_coins, credited_days FROM mining_purchases WHERE wallet_address = ? AND (${id ? 'id = ?' : 'tx_hash = ?'})`)
        .bind(lower, id ? Number(id) : String(tx_hash || ''))
        .first<{ id: number; daily_coins: number; credited_days: number }>()
      if (!row) return c.json({ error: 'Purchase not found' }, 404)

      const credited = Math.max(0, Number(row.daily_coins || 0)) * Math.max(0, Number(row.credited_days || 0))
      if (credited > 0) {
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

  // ---- Reconcile selected user (Auto Fix) ----
  app.post('/api/admin/reconcile-user', async (c) => {
    try {
      const body = await c.req.json<{ address: string; timestamp: number; signature: string; user_id?: string; wallet?: string; lookback_days?: number }>()
      const auth = await requireAdminAuth(c, 'reconcile_user', body)
      if ((auth as any).error) return c.json(auth, 400)

      const { user_id, wallet } = body || ({} as any)
      const lookback_days = Math.max(1, Math.min(Number(body?.lookback_days || 180), 365))
      if (!user_id && !wallet) return c.json({ error: 'user_id or wallet required' }, 400)

      let row: any = null
      if (wallet && ethers.isAddress(wallet)) {
        row = await c.env.DB.prepare('SELECT user_id, wallet_address, coin_balance FROM users WHERE wallet_address = ?').bind(wallet.toLowerCase()).first()
      } else if (user_id && typeof user_id === 'string') {
        row = await c.env.DB.prepare('SELECT user_id, wallet_address, coin_balance FROM users WHERE user_id = ?').bind(user_id.toUpperCase()).first()
      }
      if (!row) return c.json({ error: 'User not found' }, 404)

      const walletLower = String(row.wallet_address).toLowerCase()
      const uidUpper = String(row.user_id || '').toUpperCase()

      const imp = await importMinerPurchasesFromLogs(c.env, walletLower, lookback_days)
      const norm = await normalizeMinersForWallet(c.env, walletLower)
      const credit = await creditMiningIfDue(c.env.DB, walletLower, c.env)

      const prevBalRow = await c.env.DB.prepare('SELECT coin_balance FROM users WHERE wallet_address = ?').bind(walletLower).first<{ coin_balance: number }>()
      const prevBal = Number(prevBalRow?.coin_balance || 0)
      const comp = await computeExpectedBalanceForUser(c.env.DB, walletLower, uidUpper)
      const expected = Math.max(0, Number(comp.expected || 0))
      if (prevBal !== expected) {
        await c.env.DB.prepare('UPDATE users SET coin_balance = ? WHERE wallet_address = ?').bind(expected, walletLower).run()
      }

      return c.json({
        ok: true,
        wallet: walletLower,
        added_miners: imp.added || 0,
        corrected_daily: norm.corrected || 0,
        credited_now: credit.credited_coins || 0,
        prev_balance: prevBal,
        expected_balance: expected,
        new_balance: expected,
      })
    } catch (e: any) {
      console.error('POST /api/admin/reconcile-user error:', e?.stack || e?.message || e)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // ---- Miner Fix (per-miner) ----
  app.post('/api/admin/miner-fix', async (c) => {
    try {
      const body = await c.req.json<{ address: string; timestamp: number; signature: string; wallet: string; id?: number; tx_hash?: string }>()
      const auth = await requireAdminAuth(c, 'miner_fix', body)
      if ((auth as any).error) return c.json(auth, 400)

      const { wallet, id, tx_hash } = body || ({} as any)
      if (!ethers.isAddress(wallet)) return c.json({ error: 'Invalid wallet' }, 400)

      const lower = wallet.toLowerCase()
      const row = await c.env.DB
        .prepare(`SELECT id, tx_hash, daily_coins, total_days, credited_days, start_date FROM mining_purchases WHERE wallet_address = ? AND (${id ? 'id = ?' : 'tx_hash = ?'})`)
        .bind(lower, id ? Number(id) : String(tx_hash || ''))
        .first<{ id: number; tx_hash: string; daily_coins: number; total_days: number; credited_days: number; start_date: string }>()
      if (!row) return c.json({ error: 'Purchase not found' }, 404)

      const useTx = String(row.tx_hash || tx_hash || '')
      if (!useTx) return c.json({ error: 'This miner has no tx_hash; cannot verify on-chain' }, 400)

      const provider = getProvider(c.env)
      const receipt = await provider.getTransactionReceipt(useTx)
      if (!receipt || receipt.status !== 1) return c.json({ error: 'Tx not found or failed' }, 400)
      const log = (receipt.logs || []).find(
        (lg: any) =>
          lg.address &&
          ethers.getAddress(lg.address) === ethers.getAddress(c.env.CONTRACT_ADDRESS) &&
          lg.topics &&
          lg.topics[0] === MINER_PURCHASED_TOPIC
      )
      if (!log) return c.json({ error: 'MinerPurchased event not found in tx' }, 400)

      const parsed = IFACE.parseLog({ topics: log.topics, data: log.data })
      const userAddr = ethers.getAddress(parsed.args.user as string)
      if (userAddr.toLowerCase() !== lower) return c.json({ error: 'Event user mismatch' }, 400)

      const amountRaw = BigInt(parsed.args.amount.toString())
      const startTime = Number(parsed.args.startTime)
      const correctedDaily = await computeDailyCoins(c.env, amountRaw)
      const correctedStart = new Date(startTime * 1000).toISOString().slice(0, 10)

      // Update row if needed
      const fields: string[] = []
      const vals: any[] = []
      if (Number(row.daily_coins || 0) !== correctedDaily) { fields.push('daily_coins = ?'); vals.push(correctedDaily) }
      if (String(row.start_date || '') !== correctedStart) { fields.push('start_date = ?'); vals.push(correctedStart) }
      if (fields.length) {
        const sql = `UPDATE mining_purchases SET ${fields.join(', ')} WHERE id = ?`
        vals.push(Number(row.id))
        await c.env.DB.prepare(sql).bind(...vals).run()
      }

      // Credit any due now
      const credit = await creditMiningIfDue(c.env.DB, lower, c.env)

      // Return latest row
      const fresh = await c.env.DB
        .prepare('SELECT id, tx_hash, daily_coins, total_days, credited_days, start_date FROM mining_purchases WHERE id = ?')
        .bind(row.id)
        .first<{ id: number; tx_hash: string; daily_coins: number; total_days: number; credited_days: number; start_date: string }>()
      return c.json({
        ok: true,
        corrected_daily: Number(fields.length ? correctedDaily : row.daily_coins),
        credited_now: credit.credited_coins || 0,
        miner: {
          id: fresh?.id || row.id,
          tx_hash: fresh?.tx_hash || row.tx_hash,
          daily_coins: Number(fresh?.daily_coins ?? correctedDaily),
          start_date: fresh?.start_date || correctedStart,
          total_days: Number(fresh?.total_days ?? row.total_days),
          credited_days: Number(fresh?.credited_days ?? row.credited_days),
        }
      })
    } catch (e: any) {
      console.error('POST /api/admin/miner-fix error:', e?.stack || e?.message || e)
      return c.json({ error: 'Server error' }, 500)
    }
  })

  // ---- Mining Coin Edit (set-to) ----
  app.post('/api/admin/mining-edit', async (c) => {
    try {
      const body = await c.req.json<{ address: string; timestamp: number; signature: string; wallet: string; set_to: number; reason?: string }>()
      const auth = await requireAdminAuth(c, 'mining_edit', body)
      if ((auth as any).error) return c.json(auth, 400)

      const { wallet, set_to, reason } = body || ({} as any)
      if (!ethers.isAddress(wallet)) return c.json({ error: 'Invalid wallet' }, 400)
      if (!Number.isFinite(set_to)) return c.json({ error: 'set_to must be a number' }, 400)

      const lower = wallet.toLowerCase()

      // current mining = base mined + adjustments
      const minedBaseRow = await c.env.DB
        .prepare('SELECT SUM(daily_coins*credited_days) AS sum FROM mining_purchases WHERE wallet_address = ?')
        .bind(lower)
        .first<{ sum: number }>()
      const minedAdjRow = await c.env.DB
        .prepare('SELECT SUM(delta) AS sum FROM mining_adjustments WHERE wallet_address = ?')
        .bind(lower)
        .first<{ sum: number }>()
      const current = Math.max(0, Number(minedBaseRow?.sum || 0)) + Math.max(0, Number(minedAdjRow?.sum || 0))

      const delta = Math.trunc(Number(set_to) - current)
      if (delta === 0) return c.json({ ok: true, wallet: lower, unchanged: true, mining_total: current })

      // record mining adjustment and update user coin balance
      await c.env.DB.prepare('INSERT INTO mining_adjustments (wallet_address, delta, reason, admin) VALUES (?, ?, ?, ?)')
        .bind(lower, delta, (reason || 'mining_edit').slice(0, 200), ethers.getAddress(body.address))
        .run()
      await c.env.DB.prepare('UPDATE users SET coin_balance = coin_balance + ? WHERE wallet_address = ?').bind(delta, lower).run()

      const newTotal = current + delta
      return c.json({ ok: true, wallet: lower, prev_total: current, new_total: newTotal, delta })
    } catch (e: any) {
      console.error('POST /api/admin/mining-edit error:', e?.stack || e?.message || e)
      return c.json({ error: 'Server error' }, 500)
    }
  })
}
