import React, { useEffect, useMemo, useRef, useState } from 'react'
import Surface from '../common/Surface'
import { signAuthMessage } from '../../utils/contract'
import { getStats, markLogin, upsertUserFromChain, type StatsResponse } from '../../services/api'
import { isValidAddress } from '../../utils/wallet'
import { showErrorToast, showSuccessToast } from '../../utils/notification'
import { useQuery } from '@tanstack/react-query'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
  danger: '#ef4444',
}

const styles: Record<string, React.CSSProperties> = {
  cardTitle: { margin: '0 0 6px 0', fontSize: 16, fontWeight: 900 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  statBox: { background: 'rgba(0,0,0,0.30)', border: `1px solid ${colors.grayLine}`, borderRadius: 12, padding: 10, textAlign: 'center' as const },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statValue: { fontSize: 22, fontWeight: 900 },
  button: {
    height: 44, borderRadius: 10,
    background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`,
    color: '#0b1b3b', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', width: '100%',
    boxShadow: '0 4px 15px rgba(20,184,166,0.3)',
  },
  buttonDisabled: { opacity: 0.65, cursor: 'not-allowed' },
  small: { fontSize: 12, color: colors.textMuted, textAlign: 'center' as const, marginTop: 6 },
}

type Props = {
  account: string | null
}

const StatsAndLoginCard: React.FC<Props> = ({ account }) => {
  // Off-chain stats (DB-driven)
  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useQuery<StatsResponse | null>({
    queryKey: ['stats-lite', account],
    enabled: isValidAddress(account),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return null
      try {
        const res = await getStats(account!)
        return res.data
      } catch (err: any) {
        const status = err?.response?.status || err?.status
        if (status === 404) return null
        throw err
      }
    },
  })

  // Claim button state
  const [claimedToday, setClaimedToday] = useState<boolean>(false)
  const [nextResetMs, setNextResetMs] = useState<number | null>(null)
  const [countdown, setCountdown] = useState<string>('')

  useEffect(() => {
    if (!stats?.logins) return
    setClaimedToday(Boolean(stats.logins.today_claimed))
    setNextResetMs(Number(stats.logins.next_reset_utc_ms || 0))
  }, [stats?.logins?.today_claimed, stats?.logins?.next_reset_utc_ms])

  const resetTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (!claimedToday || !nextResetMs) return
    const delay = Math.max(0, nextResetMs - Date.now())
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(async () => {
      setClaimedToday(false)
      await refetchStats()
    }, delay)
    return () => { if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current) }
  }, [claimedToday, nextResetMs, refetchStats])

  useEffect(() => {
    if (!claimedToday || !nextResetMs) { setCountdown(''); return }
    let id: number | null = null
    const tick = () => {
      const ms = Math.max(0, nextResetMs - Date.now())
      const s = Math.floor(ms / 1000)
      const hh = String(Math.floor(s / 3600)).padStart(2, '0')
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      setCountdown(`${hh}:${mm}:${ss}`)
    }
    tick()
    id = window.setInterval(tick, 1000)
    return () => { if (id) window.clearInterval(id) }
  }, [claimedToday, nextResetMs])

  const canClaimToday = isValidAddress(account) && !claimedToday

  const handleMarkTodayLogin = async () => {
    if (!isValidAddress(account)) return
    try {
      const { timestamp, signature } = await signAuthMessage(account!)
      let resp: Awaited<ReturnType<typeof markLogin>> | null = null
      try {
        resp = await markLogin(account!, timestamp, signature)
      } catch (err: any) {
        const status = err?.response?.status || err?.status
        if (status === 404) {
          await upsertUserFromChain(account!, timestamp, signature)
          resp = await markLogin(account!, timestamp, signature)
        } else {
          throw err
        }
      }
      const data = resp?.data as any
      if (data) {
        setClaimedToday(Boolean(data.today_claimed))
        setNextResetMs(Number(data.next_reset_utc_ms || 0))
      }
      showSuccessToast('Login counted for today')
      await refetchStats()
    } catch (e) {
      showErrorToast(e, 'Unable to mark login')
    }
  }

  const totalReferrals = stats?.referrals?.l1_count ?? 0
  const totalLoginDays = stats?.logins?.total_login_days ?? 0

  return (
    <Surface>
      <h3 style={styles.cardTitle}>Your Stats</h3>
      <div style={styles.grid2}>
        <div style={styles.statBox}>
          <div style={styles.statLabel}>Total Refer</div>
          <div style={styles.statValue}>{isStatsLoading ? '...' : totalReferrals}</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statLabel}>Total Login (days)</div>
          <div style={styles.statValue}>{isStatsLoading ? '...' : totalLoginDays}</div>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button
          style={{ ...styles.button, ...(!canClaimToday ? styles.buttonDisabled : {}) }}
          disabled={!canClaimToday}
          onClick={handleMarkTodayLogin}
          title={claimedToday ? 'Already signed today' : 'Mark Today’s Login'}
        >
          {claimedToday ? `Already signed${countdown ? ` • Resets in ${countdown}` : ''}` : 'Mark Today’s Login'}
        </button>
        {claimedToday && countdown && (
          <div style={styles.small}>
            Next reset at UTC 00:00 • {countdown}
          </div>
        )}
      </div>
    </Surface>
  )
}

export default StatsAndLoginCard
