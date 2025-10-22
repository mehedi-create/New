// backend/src/utils/mining.ts
import { ethers } from 'ethers'
import type { Bindings } from './types'
import {
  IFACE,
  MINER_PURCHASED_TOPIC,
  addressTopic,
  computeDailyCoins,
} from './chain'
import {
  todayISODate,
  isoDateFromUnix,
  daysBetweenInclusive,
} from './db'
import { getProvider } from './chain'

export async function normalizePurchaseRowIfNeeded(
  env: Bindings,
  row: { id: number; tx_hash: string; daily_coins: number }
): Promise<number> {
  const weird = !row.daily_coins || row.daily_coins <= 0 || row.daily_coins > 100000
  if (!weird) return row.daily_coins
  if (!row.tx_hash) return row.daily_coins
  try {
    const provider = getProvider(env)
    const receipt = await provider.getTransactionReceipt(row.tx_hash)
    if (!receipt || receipt.status !== 1) return row.daily_coins
    const log = (receipt.logs || []).find(
      (lg: any) =>
        lg.address &&
        ethers.getAddress(lg.address) === ethers.getAddress(env.CONTRACT_ADDRESS) &&
        lg.topics &&
        lg.topics[0] === MINER_PURCHASED_TOPIC
    )
    if (!log) return row.daily_coins
    const parsed = IFACE.parseLog({ topics: log.topics, data: log.data })
    const amountRaw = BigInt(parsed.args.amount.toString())
    const corrected = await computeDailyCoins(env, amountRaw)
    if (corrected > 0) {
      await env.DB.prepare('UPDATE mining_purchases SET daily_coins = ? WHERE id = ?')
        .bind(corrected, row.id)
        .run()
      return corrected
    }
  } catch (e) {
    console.warn('normalizePurchaseRowIfNeeded failed:', (e as any)?.message || e)
  }
  return row.daily_coins
}

export async function creditMiningIfDue(
  db: D1Database,
  walletLower: string,
  env?: Bindings
) {
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
    if (env) {
      r.daily_coins = await normalizePurchaseRowIfNeeded(env, {
        id: r.id,
        tx_hash: r.tx_hash,
        daily_coins: r.daily_coins,
      })
    }

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
    await db
      .prepare('UPDATE users SET coin_balance = coin_balance + ? WHERE wallet_address = ?')
      .bind(totalCoinDelta, walletLower)
      .run()
  }
  return { credited_coins: totalCoinDelta }
}

export async function importMinerPurchasesFromLogs(
  env: Bindings,
  walletLower: string,
  lookbackDays = 180
) {
  const provider = getProvider(env)
  const latest = await provider.getBlockNumber()
  const days = Math.max(1, Math.min(lookbackDays, 365))
  const fromBlock = Math.max(0, latest - days * 28800) // ~28800 blocks/day
  const toBlock = latest
  const contractAddr = ethers.getAddress(env.CONTRACT_ADDRESS)
  const topicUser = addressTopic(walletLower)

  const logs = await provider.getLogs({
    address: contractAddr,
    fromBlock,
    toBlock,
    topics: [MINER_PURCHASED_TOPIC, topicUser],
  })

  let added = 0
  for (const lg of logs) {
    const txh = lg.transactionHash
    const exists = await env.DB.prepare('SELECT 1 FROM mining_purchases WHERE tx_hash = ?').bind(txh).first()
    if (exists) continue
    let parsed: any
    try { parsed = IFACE.parseLog({ topics: lg.topics, data: lg.data }) } catch { continue }
    const userAddr = ethers.getAddress(parsed.args.user as string)
    if (userAddr.toLowerCase() !== walletLower) continue

    const amountRaw = BigInt(parsed.args.amount.toString())
    const startTime = Number(parsed.args.startTime)
    const dailyCoins = await computeDailyCoins(env, amountRaw)
    const startDate = isoDateFromUnix(startTime)

    await env.DB.prepare(
      `INSERT INTO mining_purchases (wallet_address, tx_hash, daily_coins, total_days, credited_days, start_date)
       VALUES (?, ?, ?, 30, 0, ?)`
    ).bind(walletLower, txh, Math.max(0, dailyCoins), startDate).run()
    added++
  }
  return { added }
}

export async function normalizeMinersForWallet(env: Bindings, walletLower: string) {
  const res = await env.DB
    .prepare('SELECT id, tx_hash, daily_coins FROM mining_purchases WHERE wallet_address = ?')
    .bind(walletLower)
    .all<{ id: number; tx_hash: string; daily_coins: number }>()
  const rows = res.results || []
  let corrected = 0
  for (const r of rows) {
    const before = Number(r.daily_coins || 0)
    const after = await normalizePurchaseRowIfNeeded(env, r)
    if (Number(after) !== before) corrected++
  }
  return { corrected }
}

/**
 * expected coin balance =
 *   logins (days)
 * + referral rewards sum
 * + mined coins (sum of daily_coins*credited_days)
 * + admin_coin_audit sum
 * + mining_adjustments sum
 */
export async function computeExpectedBalanceForUser(
  db: D1Database,
  walletLower: string,
  uidUpper: string
) {
  const loginRow = await db.prepare('SELECT COUNT(*) AS cnt FROM logins WHERE wallet_address = ?')
    .bind(walletLower).first<{ cnt: number }>()
  const refSum = await db.prepare('SELECT SUM(reward_coins) AS sum FROM referral_rewards WHERE referrer_id = ?')
    .bind(uidUpper).first<{ sum: number }>()
  const mined = await db.prepare('SELECT SUM(daily_coins * credited_days) AS sum FROM mining_purchases WHERE wallet_address = ?')
    .bind(walletLower).first<{ sum: number }>()
  const adminAdj = await db.prepare('SELECT SUM(delta) AS sum FROM admin_coin_audit WHERE wallet_address = ?')
    .bind(walletLower).first<{ sum: number }>()
  const miningAdj = await db.prepare('SELECT SUM(delta) AS sum FROM mining_adjustments WHERE wallet_address = ?')
    .bind(walletLower).first<{ sum: number }>()

  const total =
    Math.max(0, Number(loginRow?.cnt || 0)) +
    Math.max(0, Number(refSum?.sum || 0)) +
    Math.max(0, Number(mined?.sum || 0)) +
    Math.max(0, Number(adminAdj?.sum || 0)) +
    Math.max(0, Number(miningAdj?.sum || 0))

  return { expected: total }
}
