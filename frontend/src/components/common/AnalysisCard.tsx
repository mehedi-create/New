import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Surface from './Surface'
import { getAdminOverview, api } from '../../services/api'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  small: { fontSize: 12, color: colors.textMuted },
  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontWeight: 900, fontSize: 13 },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontSize: 13 },
  tabs: { display: 'flex', gap: 8, marginBottom: 8 },
  tabBtn: {
    height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: colors.text,
    border: `1px solid ${colors.grayLine}`, fontWeight: 800, cursor: 'pointer', padding: '0 12px',
  },
  tabActive: { borderColor: colors.accent },
}

type Metric = 'coins' | 'usdt'

type WeeklyTopItem = {
  rank?: number
  user_id: string
  wallet_address: string
  amount: number        // amount in selected metric (coins/usdt)
  referrals?: number    // number of referrals in the same window
}

// Fallback fetcher — expects backend endpoint:
// GET /api/admin/weekly-top?metric=coins|usdt&limit=10
async function fetchWeeklyTop(metric: Metric, limit = 10): Promise<WeeklyTopItem[]> {
  try {
    const res = await api.get<{ ok: boolean; items: WeeklyTopItem[] }>('/api/admin/weekly-top', { params: { metric, limit } })
    const list = Array.isArray(res.data?.items) ? res.data.items : []
    return list.map((it, idx) => ({ ...it, rank: idx + 1 }))
  } catch {
    return []
  }
}

const AnalysisCard: React.FC<{ limit?: number; showTotals?: boolean; title?: string }> = ({ limit = 10, showTotals = true, title = 'Analysis' }) => {
  const [metric, setMetric] = useState<Metric>('coins')

  // Totals (users + coins)
  const { data: overview } = useQuery({
    queryKey: ['adminOverview'],
    queryFn: async () => (await getAdminOverview()).data,
    refetchInterval: 60000,
  })
  const totalUsers = overview?.total_users ?? 0
  const totalCoins = overview?.total_coins ?? 0

  // Weekly top 10 (by metric)
  const { data: topList = [], isFetching } = useQuery<WeeklyTopItem[]>({
    queryKey: ['weeklyTop', metric, limit],
    queryFn: () => fetchWeeklyTop(metric, limit),
    refetchInterval: 60000,
  })

  const unitLabel = useMemo(() => (metric === 'coins' ? 'Coins' : 'USDT'), [metric])

  return (
    <Surface title={title} sub={`Totals + Weekly Top 10 (${unitLabel})`}>
      {showTotals && (
        <div style={{ ...styles.small, marginBottom: 10 }}>
          Total users: <strong style={{ color: colors.accent }}>{totalUsers}</strong>
          {' '}• Total coins: <strong style={{ color: colors.accent }}>{Number(totalCoins || 0).toFixed(0)}</strong>
        </div>
      )}

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tabBtn, ...(metric === 'coins' ? styles.tabActive : {}) }}
          onClick={() => setMetric('coins')}
        >
          Coins (weekly)
        </button>
        <button
          style={{ ...styles.tabBtn, ...(metric === 'usdt' ? styles.tabActive : {}) }}
          onClick={() => setMetric('usdt')}
        >
          USDT (weekly)
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>User ID</th>
              <th style={styles.th}>Wallet</th>
              <th style={{ ...styles.th, textAlign: 'right' as const }}>{unitLabel}</th>
              <th style={{ ...styles.th, textAlign: 'right' as const }}>Referrals</th>
            </tr>
          </thead>
        <tbody>
            {isFetching ? (
              <tr><td colSpan={5} style={styles.td}>Loading...</td></tr>
            ) : (topList || []).length === 0 ? (
              <tr><td colSpan={5} style={{ ...styles.td, color: colors.textMuted }}>No weekly data (backend endpoint pending)</td></tr>
            ) : (
              (topList || []).map((r, idx) => (
                <tr key={`${r.wallet_address}-${idx}`}>
                  <td style={styles.td}>{r.rank ?? idx + 1}</td>
                  <td style={styles.td}>{r.user_id || '-'}</td>
                  <td style={styles.td}>
                    <span title={r.wallet_address}>
                      {r.wallet_address.slice(0, 6)}…{r.wallet_address.slice(-4)}
                    </span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{Number(r.amount || 0).toFixed(2)}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{r.referrals ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ ...styles.small, marginTop: 8 }}>
        Note: Weekly = last 7 days window. Metric toggle switches between earned Coins vs deposited USDT.
      </div>
    </Surface>
  )
}

export default AnalysisCard
