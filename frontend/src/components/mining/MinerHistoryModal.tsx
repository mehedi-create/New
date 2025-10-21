import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMiningHistory, type MiningHistoryItem } from '../../services/api'
import { isValidAddress } from '../../utils/wallet'
import { config } from '../../config'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12,
  },
  shell: { maxWidth: 760, width: '100%' },
  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontWeight: 900, fontSize: 13 },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontSize: 13 },
  statusActive: { color: colors.accent, fontWeight: 900 },
  statusExpired: { color: colors.textMuted, fontWeight: 800 },
  iconBtnGhost: {
    height: 32, width: 32, borderRadius: 8,
    background: 'rgba(255,255,255,0.06)', color: colors.text,
    border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
}

const Surface: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div className="lxr-surface" style={style}>
    <div className="lxr-surface-lines" />
    <div className="lxr-surface-mesh" />
    <div className="lxr-surface-circuit" />
    <div className="lxr-surface-holo" />
    <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
  </div>
)

function getExplorerBase() {
  return config.chainId === 56 ? 'https://bscscan.com' : 'https://testnet.bscscan.com'
}

type Props = {
  open: boolean
  account: string | null
  onClose: () => void
}

const MinerHistoryModal: React.FC<Props> = ({ open, account, onClose }) => {
  const { data: items = [], isLoading, refetch } = useQuery<MiningHistoryItem[]>({
    queryKey: ['minerHistory', account, open],
    enabled: open && isValidAddress(account),
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!isValidAddress(account)) return []
      const res = await getMiningHistory(account!)
      return res.data.items || []
    },
  })

  if (!open) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <Surface style={styles.shell} >
        <div style={{ position: 'relative', zIndex: 2, padding: 4 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 900 }}>Miner Purchase History</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="lxr-buy-btn" onClick={() => refetch()} disabled={isLoading}>
                {isLoading ? 'LOADING...' : 'Reload'}
              </button>
              <button style={styles.iconBtnGhost} onClick={onClose} aria-label="Close">✕</button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Amount (USDT)</th>
                  <th style={styles.th}>Daily Coins</th>
                  <th style={styles.th}>Credited/Total</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} style={styles.td}>Loading...</td></tr>
                ) : (items || []).length === 0 ? (
                  <tr><td colSpan={7} style={{ ...styles.td, color: colors.textMuted }}>No purchases found</td></tr>
                ) : (
                  (items || []).map((h, idx) => (
                    <tr key={h.tx_hash || `${h.start_date}-${idx}`}>
                      <td style={styles.td}>{idx + 1}</td>
                      <td style={styles.td}>{h.start_date}</td>
                      <td style={styles.td}>${Number(h.amount_usd || 0).toFixed(2)}</td>
                      <td style={styles.td}>{Number(h.daily_coins || 0).toFixed(2)}</td>
                      <td style={styles.td}>{h.credited_days}/{h.total_days}</td>
                      <td style={styles.td}>
                        {h.active ? (
                          <span style={styles.statusActive}>Active • {h.days_left}d left</span>
                        ) : (
                          <span style={styles.statusExpired}>Expired • {h.end_date}</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {h.tx_hash ? (
                          <a
                            href={`${getExplorerBase()}/tx/${h.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: colors.accent, textDecoration: 'underline' }}
                          >
                            View
                          </a>
                        ) : (
                          <span style={{ color: colors.textMuted }}>N/A</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>
            Note: Active = within 30 days from purchase. Daily Coins = coins/day; Amount(USDT) = your invested USD.
          </div>
        </div>
      </Surface>
    </div>
  )
}

export default MinerHistoryModal
