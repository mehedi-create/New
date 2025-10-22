import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Surface from '../common/Surface'
import {
  getAdminUserInfo,
  getMiningHistory,
  adminMinerAdd,
  adminMinerRemove,
  adminMinerFix,
  adminMiningEdit,
  type AdminUserInfo,
  type MiningHistoryItem,
} from '../../services/api'
import { getUserBalance } from '../../utils/contract'
import { showErrorToast, showSuccessToast } from '../../utils/notification'
import { isValidAddress } from '../../utils/wallet'

// Theme
const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
  danger: '#ef4444',
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12,
  },
  panel: { maxWidth: 950, width: '100%' },
  closeBtn: {
    height: 32, width: 32, borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`,
    display: 'grid', placeItems: 'center',
  },
  sectionTitle: { fontWeight: 900, marginBottom: 6 },
  small: { fontSize: 12, color: colors.textMuted },

  infoRow: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'center' },
  infoKey: { fontWeight: 800, color: colors.textMuted },
  infoVal: { fontWeight: 900 },

  gridCards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8, marginBottom: 8 },
  statCard: { padding: 10 },
  statLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4, fontWeight: 800 },
  statValue: { fontSize: 20, fontWeight: 900 },

  miningHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 6 },
  addBtn: {
    height: 36, borderRadius: 8,
    background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`,
    color: '#0b1b3b', border: 'none', fontSize: 13, fontWeight: 900, cursor: 'pointer', padding: '0 12px',
  },

  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontSize: 12, color: colors.textMuted },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontSize: 13 },

  iconBtn: {
    height: 32, width: 32, borderRadius: 8,
    background: 'rgba(255,255,255,0.06)', color: colors.text,
    border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center',
    cursor: 'pointer', transition: 'box-shadow .15s ease, transform .15s ease',
  },
  iconBtnDanger: {
    height: 32, width: 32, borderRadius: 8,
    background: 'rgba(185,28,28,0.15)', color: '#fff',
    border: '1px solid rgba(185,28,28,0.5)',
    display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
  iconBtnHover: { boxShadow: '0 0 0 4px rgba(20,184,166,0.25)', transform: 'translateY(-1px)' },

  miningCoinRow: { display: 'flex', alignItems: 'center', gap: 8 },
  miningEditInput: {
    height: 36, borderRadius: 8, border: `2px solid ${colors.grayLine}`,
    background: 'rgba(255,255,255,0.05)', color: colors.text, padding: '0 10px', width: 120, outline: 'none',
  },
  miningSaveBtn: {
    height: 36, borderRadius: 8, border: 'none',
    background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`, color: '#0b1b3b',
    fontWeight: 900, padding: '0 10px', cursor: 'pointer',
  },

  addModalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 12,
  },
  addModalCard: { maxWidth: 560, width: '100%' },
  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },
}

// Icons
const PencilIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18.71-11.04c.39-.39.39-1.03 0-1.42l-2.5-2.5a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.99-1.66z"/></svg>
)
const CheckIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
)
const FixIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.7 19.3l-7.4-7.4 1.4-1.4 7.4 7.4-1.4 1.4zM10 4l2 2-7 7H3v-2l7-7z"/></svg>
)
const TrashIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"/></svg>
)
const PlusIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>
)

// Admin-sign helper
async function signAdminAction(
  purpose: 'user_info' | 'adjust_coins' | 'miner_add' | 'miner_remove' | 'miner_fix' | 'mining_edit',
  adminAddress: string
) {
  const { ethers, BrowserProvider } = await import('ethers')
  const provider = new BrowserProvider((window as any).ethereum)
  const signer = await provider.getSigner()
  const ts = Math.floor(Date.now() / 1000)
  const message = `Admin action authorization
Purpose: ${purpose}
Address: ${ethers.getAddress(adminAddress)}
Timestamp: ${ts}`
  const signature = await signer.signMessage(message)
  return { timestamp: ts, signature }
}

// Utils
const safeMoney = (v?: string | number) => {
  const n = typeof v === 'string' ? parseFloat(v || '0') : Number(v || 0)
  return isNaN(n) ? '0.00' : n.toFixed(2)
}
const isValidTxHash = (s: string) => /^0x([A-Fa-f0-9]{64})$/.test(s || '')

type Props = {
  open: boolean
  onClose: () => void
  adminAddress: string
  allow: boolean
  initialUser?: AdminUserInfo['user'] | null
}

const UserDetailModal: React.FC<Props> = ({ open, onClose, adminAddress, allow, initialUser }) => {
  const [user, setUser] = useState<AdminUserInfo['user'] | null>(initialUser || null)

  const wallet = user?.wallet_address
  const uid = user?.user_id

  // On-chain USDT balance
  const { data: usdtBalance, isFetching: isFetchingOnChain } = useQuery<string>({
    queryKey: ['admin-user-usdt', wallet],
    enabled: !!wallet && isValidAddress(wallet || ''),
    refetchInterval: 30000,
    queryFn: async () => (wallet ? await getUserBalance(wallet) : '0'),
  })

  // Mining Coin edit state
  const currentMiningTotal = (user?.mining?.mined_coins || 0) + (user?.mining?.adjustments || 0)
  const [editingMining, setEditingMining] = useState(false)
  const [miningTarget, setMiningTarget] = useState<string>(() => String(currentMiningTotal || 0))

  useEffect(() => {
    setMiningTarget(String(currentMiningTotal || 0))
  }, [currentMiningTotal])

  // Miners
  const [miners, setMiners] = useState<MiningHistoryItem[]>([])
  const [loadingMiners, setLoadingMiners] = useState(false)

  const fetchMiners = async () => {
    if (!wallet || !isValidAddress(wallet)) return
    setLoadingMiners(true)
    try {
      const res = await getMiningHistory(wallet)
      setMiners(res.data.items || [])
    } catch {
      setMiners([])
    } finally {
      setLoadingMiners(false)
    }
  }

  // Refresh user from DB (background)
  const refreshUser = async () => {
    if (!adminAddress || !(wallet || uid)) return
    try {
      const { timestamp, signature } = await signAdminAction('user_info', adminAddress)
      const payload: any = { address: adminAddress, timestamp, signature }
      if (wallet && isValidAddress(wallet)) payload.wallet = wallet
      else if (uid) payload.user_id = uid
      const res = await getAdminUserInfo(payload)
      if (res.data?.ok && res.data?.user) setUser(res.data.user)
    } catch (e) { /* silent */ }
  }

  useEffect(() => {
    if (!open) return
    setUser(initialUser || null)
    fetchMiners()
    refreshUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUser?.wallet_address, initialUser?.user_id])

  // Mining Coin save
  const onSaveMiningEdit = async () => {
    if (!user) return
    const target = Number(miningTarget)
    if (!Number.isFinite(target)) { showErrorToast('Enter a valid number'); return }
    try {
      const { timestamp, signature } = await signAdminAction('mining_edit', adminAddress)
      const res = await adminMiningEdit({
        address: adminAddress,
        timestamp, signature,
        wallet: user.wallet_address,
        set_to: Math.floor(target),
        reason: 'mining_correction',
      })
      const d = res.data
      if (d?.ok) {
        showSuccessToast(`Mining coin set → ${d.new_total} (Δ ${d.delta >= 0 ? '+' : ''}${d.delta})`)
        setEditingMining(false)
        await refreshUser()
      } else {
        showErrorToast('Failed to set mining coin')
      }
    } catch (e) {
      showErrorToast(e, 'Failed to set mining coin')
    }
  }

  // Per-miner Fix
  const onFixMiner = async (m: MiningHistoryItem) => {
    if (!user) return
    try {
      const { timestamp, signature } = await signAdminAction('miner_fix', adminAddress)
      const res = await adminMinerFix({
        address: adminAddress,
        timestamp, signature,
        wallet: user.wallet_address,
        id: m.id,
      })
      const d = res.data
      if (d?.ok) {
        showSuccessToast(`Miner fixed • daily=${d.miner.daily_coins} • credited +${d.credited_now}`)
        await fetchMiners()
        await refreshUser()
      } else {
        showErrorToast('Miner fix failed')
      }
    } catch (e) {
      showErrorToast(e, 'Miner fix failed')
    }
  }

  // Per-miner Delete
  const onDeleteMiner = async (m: MiningHistoryItem) => {
    if (!user) return
    if (!window.confirm(`Delete miner #${m.id}? Already-credited coins will be deducted.`)) return
    try {
      const { timestamp, signature } = await signAdminAction('miner_remove', adminAddress)
      const res = await adminMinerRemove({
        address: adminAddress,
        timestamp, signature,
        wallet: user.wallet_address,
        id: m.id,
      })
      const d = res.data
      if (d?.ok) {
        showSuccessToast(`Miner removed • deducted ${d.deducted} coins`)
        await fetchMiners()
        await refreshUser()
      } else {
        showErrorToast('Failed to remove miner')
      }
    } catch (e) {
      showErrorToast(e, 'Failed to remove miner')
    }
  }

  // Add Miner modal state
  const [showAdd, setShowAdd] = useState(false)
  const [mode, setMode] = useState<'verify' | 'force'>('verify')
  const [txHash, setTxHash] = useState('')
  const [amountUsd, setAmountUsd] = useState('') // for force
  const [startDate, setStartDate] = useState('') // YYYY-MM-DD
  const [totalDays, setTotalDays] = useState('30')
  const addingDisabled = mode === 'verify' ? !isValidTxHash(txHash) : !(Number(amountUsd) > 0)

  const onAddMiner = async () => {
    if (!user) return
    try {
      const { timestamp, signature } = await signAdminAction('miner_add', adminAddress)
      const res = await adminMinerAdd({
        address: adminAddress,
        timestamp, signature,
        wallet: user.wallet_address,
        mode,
        tx_hash: mode === 'verify' ? txHash : undefined,
        amount_usd: mode === 'force' ? Math.floor(Number(amountUsd || '0')) : undefined,
        start_date: mode === 'force' ? (startDate || undefined) : undefined,
        total_days: Number(totalDays || '30'),
      })
      const d = res.data as any
      if (d?.ok) {
        showSuccessToast(`Miner added • daily=${d.daily_coins} • credited ${d.credited_now} (${d.mode})`)
        setShowAdd(false)
        setTxHash(''); setAmountUsd(''); setStartDate(''); setTotalDays('30'); setMode('verify')
        await fetchMiners()
        await refreshUser()
      } else {
        showErrorToast(d?.error || 'Add miner failed')
      }
    } catch (e) {
      showErrorToast(e, 'Add miner failed')
    }
  }

  if (!open) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="lxr-surface" style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className="lxr-surface-lines" />
        <div className="lxr-surface-mesh" />
        <div className="lxr-surface-circuit" />
        <div className="lxr-surface-holo" />
        <div style={{ position: 'relative', zIndex: 2, padding: 10 }}>
          {/* Top bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 900, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>User ID: {user?.user_id || '-'}</span>
              <span style={{ fontWeight: 700, color: colors.textMuted }}>
                Wallet: {user?.wallet_address || '-'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.addBtn} onClick={() => setShowAdd(true)}>
                <PlusIcon />&nbsp;Add Miner
              </button>
              <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
            </div>
          </div>

          {/* Summary list (vertical order as requested) */}
          <Surface>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={styles.infoRow}><div style={styles.infoKey}>Wallet Balance</div><div style={styles.infoVal}>${safeMoney(usdtBalance)} {isFetchingOnChain && <span style={styles.small}>updating</span>}</div></div>
              <div style={styles.infoRow}><div style={styles.infoKey}>Coin Balance</div><div style={styles.infoVal}>{user?.coin_balance ?? 0}</div></div>
              <div style={styles.infoRow}><div style={styles.infoKey}>Total Login</div><div style={styles.infoVal}>{user?.logins ?? 0} day</div></div>
              <div style={styles.infoRow}><div style={styles.infoKey}>Referral Coin</div><div style={styles.infoVal}>{user?.referral_coins ?? 0}</div></div>
              <div style={styles.infoRow}><div style={styles.infoKey}>Total Refer</div><div style={styles.infoVal}>{user?.l1_count ?? 0}</div></div>

              {/* Mining Coin with edit icon */}
              <div style={styles.infoRow}>
                <div style={styles.infoKey}>Mining Coin</div>
                <div>
                  {!editingMining ? (
                    <div style={styles.miningCoinRow}>
                      <div style={{ ...styles.infoVal }}>{currentMiningTotal}</div>
                      <button
                        title="Edit mining coin"
                        aria-label="Edit mining coin"
                        style={styles.iconBtn}
                        onClick={() => setEditingMining(true)}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  ) : (
                    <div style={styles.miningCoinRow}>
                      <input
                        style={styles.miningEditInput}
                        value={miningTarget}
                        onChange={(e) => setMiningTarget(e.target.value.replace(/[^\d-]/g, ''))}
                        placeholder="Set to"
                      />
                      <button style={styles.miningSaveBtn} onClick={onSaveMiningEdit}>
                        <CheckIcon /> &nbsp;Save
                      </button>
                      <button style={styles.closeBtn} onClick={() => { setEditingMining(false); setMiningTarget(String(currentMiningTotal || 0)) }}>✕</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Surface>

          {/* Miners list */}
          <div style={styles.miningHeaderRow}>
            <div style={{ fontWeight: 900 }}>Miners</div>
            <div />
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Hash</th>
                  <th style={styles.th}>Invest</th>
                  <th style={styles.th}>Earn</th>
                  <th style={{ ...styles.th, textAlign: 'right' as const }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(miners || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...styles.td, color: colors.textMuted }}>
                      {loadingMiners ? 'Loading...' : 'No miners found'}
                    </td>
                  </tr>
                ) : (
                  miners.map(m => (
                    <tr key={m.id}>
                      <td style={styles.td}>{m.start_date}</td>
                      <td style={styles.td}>
                        {m.tx_hash ? (
                          <a
                            href={`https://testnet.bscscan.com/tx/${m.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: colors.accent, textDecoration: 'underline' }}
                          >
                            {m.tx_hash.slice(0, 10)}...{m.tx_hash.slice(-8)}
                          </a>
                        ) : <span style={{ color: colors.textMuted }}>N/A</span>}
                      </td>
                      <td style={styles.td}>{m.daily_coins} USDT</td>
                      <td style={styles.td}>{m.daily_coins * m.credited_days}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            title="Fix this miner"
                            aria-label="Fix miner"
                            style={styles.iconBtn}
                            onClick={() => onFixMiner(m)}
                          >
                            <FixIcon />
                          </button>
                          <button
                            title="Delete this miner"
                            aria-label="Delete miner"
                            style={styles.iconBtnDanger}
                            onClick={() => onDeleteMiner(m)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <span style={styles.small}>Tip: Fix applies only to selected miner; Delete deducts already credited coins.</span>
          </div>
        </div>
      </div>

      {/* Add Miner Modal */}
      {showAdd && (
        <div style={styles.addModalOverlay} onClick={() => setShowAdd(false)}>
          <div className="lxr-surface" style={styles.addModalCard} onClick={(e) => e.stopPropagation()}>
            <div className="lxr-surface-lines" />
            <div className="lxr-surface-mesh" />
            <div className="lxr-surface-circuit" />
            <div className="lxr-surface-holo" />
            <div style={{ position: 'relative', zIndex: 2, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 900 }}>Add Miner</div>
                <button style={styles.closeBtn} onClick={() => setShowAdd(false)} aria-label="Close">✕</button>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <button
                  style={{ ...styles.addBtn, ...(mode === 'verify' ? {} : { opacity: 0.6 }) }}
                  onClick={() => setMode('verify')}
                >
                  Verify
                </button>
                <button
                  style={{ ...styles.addBtn, background: 'linear-gradient(45deg,#64748b,#cbd5e1)', color: '#0b1b3b', ...(mode === 'force' ? {} : { opacity: 0.6 }) }}
                  onClick={() => setMode('force')}
                >
                  Force
                </button>
              </div>

              {mode === 'verify' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  <input
                    style={styles.input}
                    placeholder="Tx hash (0x...)"
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value.trim())}
                  />
                  <button className="lxr-buy-btn" disabled={addingDisabled} onClick={onAddMiner}>
                    Add (Verify)
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <input
                    style={styles.input}
                    placeholder="Amount (USD)"
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value.replace(/[^\d]/g, ''))}
                  />
                  <input
                    style={styles.input}
                    placeholder="Start date (YYYY-MM-DD)"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <input
                    style={styles.input}
                    placeholder="Total days (default 30)"
                    value={totalDays}
                    onChange={(e) => setTotalDays(e.target.value.replace(/[^\d]/g, ''))}
                  />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <button className="lxr-buy-btn" disabled={addingDisabled} onClick={onAddMiner}>
                      Add (Force)
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 8, ...styles.small }}>
                Verify mode requires a valid on-chain tx hash and checks user match/amount. Force mode skips checks.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserDetailModal
