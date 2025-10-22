import React, { useEffect, useMemo, useState } from 'react'
import Surface from '../common/Surface'
import {
  getAdminUserInfo,
  adjustUserCoins,
  adminMinerAdd,
  adminMinerRemove,
  getMiningHistory,
  adminReconcileUser,
  type AdminUserInfo,
  type MiningHistoryItem,
} from '../../services/api'
import { isValidAddress } from '../../utils/wallet'
import { showErrorToast, showSuccessToast } from '../../utils/notification'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12,
  },
  panel: { maxWidth: 900, width: '100%' },
  closeBtn: {
    height: 32, width: 32, borderRadius: 8, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`,
    display: 'grid', placeItems: 'center',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' },
  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },
  small: { fontSize: 12, color: colors.textMuted },
  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` },
  sectionTitle: { fontWeight: 900, marginBottom: 6 },
  iconBtn: {
    height: 34, width: 34, borderRadius: 8, border: `1px solid ${colors.grayLine}`,
    background: 'rgba(255,255,255,0.06)', color: colors.text, display: 'grid', placeItems: 'center', cursor: 'pointer',
    transition: 'box-shadow .15s ease, transform .15s ease',
  },
  iconBtnHover: { boxShadow: '0 0 0 4px rgba(20,184,166,0.25)', transform: 'translateY(-1px)' },
}

async function signAdminAction(
  purpose: 'user_info' | 'adjust_coins' | 'miner_add' | 'miner_remove' | 'reconcile_user',
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

const CheckIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
)

type Props = {
  open: boolean
  onClose: () => void
  adminAddress: string
  allow: boolean
  initialUser?: AdminUserInfo['user'] | null
}

const UserDetailModal: React.FC<Props> = ({ open, onClose, adminAddress, allow, initialUser }) => {
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<AdminUserInfo['user'] | null>(initialUser || null)

  const [miners, setMiners] = useState<MiningHistoryItem[]>([])
  const [isLoadingMiners, setIsLoadingMiners] = useState(false)
  const [hoverFix, setHoverFix] = useState(false)
  const wallet = user?.wallet_address
  const uid = user?.user_id

  // forms
  const [delta, setDelta] = useState('0')
  const [reason, setReason] = useState('manual correction')

  const [amountUsd, setAmountUsd] = useState('5')
  const [startDate, setStartDate] = useState('') // YYYY-MM-DD
  const [totalDays, setTotalDays] = useState('30')
  const [txRef, setTxRef] = useState('')

  const canLoad = useMemo(() => !!adminAddress && allow && (wallet || uid), [adminAddress, allow, wallet, uid])

  const refreshUser = async () => {
    if (!canLoad) return
    setLoading(true)
    try {
      const { timestamp, signature } = await signAdminAction('user_info', adminAddress)
      const payload: any = { address: adminAddress, timestamp, signature }
      if (wallet && isValidAddress(wallet)) payload.wallet = wallet
      else if (uid) payload.user_id = uid
      const res = await getAdminUserInfo(payload)
      if (res.data?.ok && res.data?.user) setUser(res.data.user)
    } catch (e) {
      showErrorToast(e, 'Failed to refresh user')
    } finally {
      setLoading(false)
    }
  }

  const fetchMiners = async () => {
    if (!wallet || !isValidAddress(wallet)) return
    setIsLoadingMiners(true)
    try {
      const res = await getMiningHistory(wallet)
      setMiners(res.data.items || [])
    } catch {
      setMiners([])
    } finally {
      setIsLoadingMiners(false)
    }
  }

  useEffect(() => {
    if (!open) return
    // on open, ensure latest data
    refreshUser()
    fetchMiners()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onAdjustCoins = async () => {
    if (!user) return
    const n = Number(delta)
    if (!Number.isFinite(n) || n === 0) { showErrorToast('Enter non-zero delta (integer)'); return }
    try {
      const { timestamp, signature } = await signAdminAction('adjust_coins', adminAddress)
      const res = await adjustUserCoins({
        address: adminAddress,
        timestamp, signature,
        wallet: user.wallet_address,
        delta: Math.trunc(n),
        reason: reason || '',
      })
      if (res.data?.ok) {
        showSuccessToast('Coin balance updated')
        await refreshUser()
      } else {
        showErrorToast('Adjustment failed')
      }
    } catch (e) { showErrorToast(e, 'Adjustment failed') }
  }

  const onAddMiner = async () => {
    if (!user) return
    const amt = Number(amountUsd || '0')
    const days = Number(totalDays || '30')
    if (!(amt > 0)) { showErrorToast('Enter amount_usd > 0'); return }
    if (!(days > 0)) { showErrorToast('Enter total_days > 0'); return }
    try {
      const { timestamp, signature } = await signAdminAction('miner_add', adminAddress)
      const res = await adminMinerAdd({
        address: adminAddress,
        timestamp, signature,
        wallet: user.wallet_address,
        amount_usd: Math.floor(amt),
        start_date: startDate || undefined,
        total_days: Math.floor(days),
        tx_hash: txRef || undefined,
      })
      if (res.data?.ok) {
        showSuccessToast(`Miner added • daily=${res.data.daily_coins} • credited now=${res.data.credited_now}`)
        await fetchMiners()
        await refreshUser()
      } else {
        showErrorToast('Failed to add miner')
      }
    } catch (e) { showErrorToast(e, 'Failed to add miner') }
  }

  const onRemoveMiner = async (id: number) => {
    if (!user) return
    if (!window.confirm(`Remove miner #${id}? Already-credited coins will be deducted.`)) return
    try {
      const { timestamp, signature } = await signAdminAction('miner_remove', adminAddress)
      const res = await adminMinerRemove({
        address: adminAddress,
        timestamp, signature,
        wallet: user.wallet_address,
        id,
      })
      if (res.data?.ok) {
        showSuccessToast(`Miner removed • deducted ${res.data.deducted} coins`)
        await fetchMiners()
        await refreshUser()
      } else {
        showErrorToast('Failed to remove miner')
      }
    } catch (e) { showErrorToast(e, 'Failed to remove miner') }
  }

  const onAutoFix = async () => {
    if (!user) return
    try {
      const { timestamp, signature } = await signAdminAction('reconcile_user', adminAddress)
      const res = await adminReconcileUser({
        address: adminAddress,
        timestamp, signature,
        wallet: user.wallet_address, // শুধু এই সিলেক্টেড ইউজার
        lookback_days: 180,
      })
      const d = res.data as any
      if (d?.ok) {
        showSuccessToast(`Auto Fix ✓ • miners +${d.added_miners || 0} • credited +${d.credited_now || 0} • balance ${d.prev_balance} → ${d.new_balance}`)
        await fetchMiners()
        await refreshUser()
      } else {
        showErrorToast('Reconcile failed')
      }
    } catch (e) {
      // যদি backend রুট না থাকে, 404 হতে পারে
      showErrorToast(e, 'Reconcile failed (backend route missing?)')
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
            <div style={{ fontWeight: 900 }}>
              User Details
              <span style={{ marginLeft: 8, fontWeight: 700, color: colors.accent }}>
                {user?.user_id} • {user?.wallet_address?.slice(0, 8)}...{user?.wallet_address?.slice(-6)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                title="Auto Fix (reconcile selected user)"
                aria-label="Auto Fix"
                style={{ ...styles.iconBtn, ...(hoverFix ? styles.iconBtnHover : {}) }}
                onMouseEnter={() => setHoverFix(true)}
                onMouseLeave={() => setHoverFix(false)}
                onClick={onAutoFix}
              >
                <CheckIcon />
              </button>
              <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
            </div>
          </div>

          {/* Summary */}
          {!user ? (
            <div style={styles.small}>Loading...</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', marginBottom: 8 }}>
                <table style={styles.table}>
                  <tbody>
                    <tr><td style={styles.td}><b>UID</b></td><td style={styles.td}>{user.user_id}</td></tr>
                    <tr><td style={styles.td}><b>Wallet</b></td><td style={styles.td}><span title={user.wallet_address}>{user.wallet_address}</span></td></tr>
                    <tr><td style={styles.td}><b>Coins</b></td><td style={styles.td}>{user.coin_balance}</td></tr>
                    <tr><td style={styles.td}><b>Logins</b></td><td style={styles.td}>{user.logins}</td></tr>
                    <tr><td style={styles.td}><b>Referral coins</b></td><td style={styles.td}>{user.referral_coins}</td></tr>
                    <tr><td style={styles.td}><b>Mining</b></td><td style={styles.td}>{user.mining.purchases} • mined={user.mining.mined_coins}</td></tr>
                    <tr><td style={styles.td}><b>Joined</b></td><td style={styles.td}>{user.created_at}</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Adjust coins */}
              <div style={{ borderTop: `1px solid ${colors.grayLine}`, paddingTop: 8, marginTop: 6 }}>
                <div style={styles.sectionTitle}>Adjust Coins</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                  <input style={styles.input} placeholder="Delta (+/- integer)" value={delta} onChange={(e) => setDelta(e.target.value)} />
                  <input style={styles.input} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="lxr-buy-btn" onClick={onAdjustCoins}>Apply</button>
                </div>
                <div style={{ ...styles.small, marginTop: 6 }}>Admin-signed change, recorded in backend audit.</div>
              </div>

              {/* Add miner */}
              <div style={{ borderTop: `1px solid ${colors.grayLine}`, paddingTop: 8, marginTop: 6 }}>
                <div style={styles.sectionTitle}>Add Miner</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 8 }}>
                  <input style={styles.input} placeholder="Amount (USD)" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} />
                  <input style={styles.input} placeholder="Start date (YYYY-MM-DD)" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <input style={styles.input} placeholder="Total days (default 30)" value={totalDays} onChange={(e) => setTotalDays(e.target.value)} />
                  <input style={styles.input} placeholder="Tx hash (optional ref)" value={txRef} onChange={(e) => setTxRef(e.target.value)} />
                  <button className="lxr-buy-btn" onClick={onAddMiner}>Add</button>
                </div>
                <div style={{ ...styles.small, marginTop: 6 }}>Catch-up credits are applied immediately.</div>
              </div>

              {/* Miner list */}
              <div style={{ borderTop: `1px solid ${colors.grayLine}`, paddingTop: 8, marginTop: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 900 }}>Miners</div>
                  <button className="lxr-buy-btn" onClick={fetchMiners} disabled={isLoadingMiners}>
                    {isLoadingMiners ? 'LOADING...' : 'Refresh'}
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>ID</th>
                        <th style={styles.th}>Start</th>
                        <th style={styles.th}>Daily</th>
                        <th style={styles.th}>Credited/Total</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Tx</th>
                        <th style={{ ...styles.th, textAlign: 'right' as const }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(miners || []).length === 0 ? (
                        <tr><td colSpan={7} style={{ ...styles.td, color: colors.textMuted }}>No miners found</td></tr>
                      ) : (
                        miners.map((m) => (
                          <tr key={m.id}>
                            <td style={styles.td}>{m.id}</td>
                            <td style={styles.td}>{m.start_date}</td>
                            <td style={styles.td}>{m.daily_coins}</td>
                            <td style={styles.td}>{m.credited_days}/{m.total_days}</td>
                            <td style={styles.td}>
                              {m.active ? (
                                <span style={{ color: colors.accent, fontWeight: 800 }}>Active • {m.days_left}d left</span>
                              ) : (
                                <span style={{ color: colors.textMuted, fontWeight: 800 }}>Expired • {m.end_date}</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              {m.tx_hash ? (
                                <a
                                  href={`https://testnet.bscscan.com/tx/${m.tx_hash}`}
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
                            <td style={{ ...styles.td, textAlign: 'right' }}>
                              <button
                                style={{ height: 36, borderRadius: 8, background: '#b91c1c', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', padding: '0 12px' }}
                                onClick={() => onRemoveMiner(m.id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default UserDetailModal
