import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Surface from '../common/Surface'
import {
  getAdminUserInfo,
  getMiningHistory,
  adminMinerAdd,
  adminMinerRemove,
  adminMinerFix,
  adminMiningEdit,
  adjustUserCoins,
  type AdminUserInfo,
  type MiningHistoryItem,
} from '../../services/api'
import { getUserBalance } from '../../utils/contract'
import { showErrorToast, showSuccessToast } from '../../utils/notification'
import { isValidAddress } from '../../utils/wallet'
import useMedia from '../../utils/useMedia'

// Theme
const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
  danger: '#ef4444',
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

// Admin-sign helper (submit সময়ই লাগবে)
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
  // Responsive flags
  const isXs = useMedia('(max-width: 420px)')
  const isSm = useMedia('(max-width: 640px)')

  // Dynamic sizes
  const fontSm = isXs ? 11 : 12
  const fontBase = isXs ? 12 : 13
  const fontBig = isXs ? 16 : 20
  const pad = isXs ? 8 : 10
  const iconSize = isXs ? 26 : 32
  const tablePad = isXs ? 6 : 8

  // Styles (typed CSSProperties; no inset used)
  const styles = {
    overlay: {
      position: 'fixed',
      top: 0, right: 0, bottom: 0, left: 0,
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: isXs ? 8 : 12,
    } as React.CSSProperties,

    panel: { maxWidth: isSm ? '96vw' : 950, width: '100%' } as React.CSSProperties,

    closeBtn: {
      height: iconSize, width: iconSize, borderRadius: 8, cursor: 'pointer',
      background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`,
      display: 'grid', placeItems: 'center', fontSize: isXs ? 14 : 16,
    } as React.CSSProperties,

    sectionTitle: { fontWeight: 900, marginBottom: 6, fontSize: isXs ? 14 : 16 } as React.CSSProperties,
    small: { fontSize: fontSm, color: colors.textMuted } as React.CSSProperties,

    infoRow: {
      display: 'grid',
      gridTemplateColumns: isXs ? '1fr' : '160px 1fr',
      gap: 6,
      alignItems: 'center',
    } as React.CSSProperties,
    infoKey: { fontWeight: 800, color: colors.textMuted, fontSize: fontSm } as React.CSSProperties,
    infoVal: { fontWeight: 900, fontSize: isXs ? 14 : 16 } as React.CSSProperties,

    headerTop: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
      gap: 8, flexWrap: 'wrap',
    } as React.CSSProperties,
    headerId: { fontWeight: 900, display: 'flex', flexDirection: 'column', gap: 2, fontSize: isXs ? 13 : 14 } as React.CSSProperties,
    walletLine: {
      fontWeight: 700, color: colors.textMuted, maxWidth: isSm ? '72vw' : 'unset',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    } as React.CSSProperties,

    addBtn: {
      height: isXs ? 32 : 36, borderRadius: 8,
      background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`,
      color: '#0b1b3b', border: 'none', fontSize: isXs ? 12 : 13, fontWeight: 900, cursor: 'pointer', padding: '0 10px',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    } as React.CSSProperties,

    tableWrap: { overflowX: 'auto' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse', color: colors.text, fontSize: fontBase } as React.CSSProperties,
    th: { textAlign: 'left', padding: `${tablePad}px 10px`, borderBottom: `1px solid ${colors.grayLine}`, fontSize: fontSm, color: colors.textMuted, whiteSpace: 'nowrap' } as React.CSSProperties,
    td: { padding: `${tablePad}px 10px`, borderBottom: `1px solid ${colors.grayLine}`, fontSize: fontBase, whiteSpace: 'nowrap' } as React.CSSProperties,

    iconBtn: {
      height: iconSize, width: iconSize, borderRadius: 8,
      background: 'rgba(255,255,255,0.06)', color: colors.text,
      border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center',
      cursor: 'pointer',
    } as React.CSSProperties,
    iconBtnDanger: {
      height: iconSize, width: iconSize, borderRadius: 8,
      background: 'rgba(185,28,28,0.15)', color: '#fff',
      border: '1px solid rgba(185,28,28,0.5)', display: 'grid', placeItems: 'center', cursor: 'pointer',
    } as React.CSSProperties,

    editRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } as React.CSSProperties,
    editInput: {
      height: isXs ? 32 : 36, borderRadius: 8, border: `2px solid ${colors.grayLine}`,
      background: 'rgba(255,255,255,0.05)', color: colors.text, padding: '0 10px',
      width: isXs ? 120 : 160, outline: 'none', fontSize: fontBase,
    } as React.CSSProperties,
    saveBtn: {
      height: isXs ? 32 : 36, borderRadius: 8, border: 'none',
      background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`, color: '#0b1b3b',
      fontWeight: 900, padding: '0 10px', cursor: 'pointer', fontSize: isXs ? 12 : 13,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    } as React.CSSProperties,

    addModalOverlay: {
      position: 'fixed',
      top: 0, right: 0, bottom: 0, left: 0,
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: isXs ? 8 : 12,
    } as React.CSSProperties,
    addModalCard: { maxWidth: isSm ? '94vw' : 560, width: '100%' } as React.CSSProperties,
    input: {
      height: isXs ? 36 : 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
      padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: fontBase, width: '100%',
    } as React.CSSProperties,
  }

  // State
  const [user, setUser] = useState<AdminUserInfo['user'] | null>(initialUser || null)

  const wallet = user?.wallet_address
  const uid = user?.user_id

  // On-chain USDT balance (read-only)
  const { data: usdtBalance, isFetching: isFetchingOnChain } = useQuery<string>({
    queryKey: ['admin-user-usdt', wallet],
    enabled: !!wallet && isValidAddress(wallet || ''),
    refetchInterval: 30000,
    queryFn: async () => (wallet ? await getUserBalance(wallet) : '0'),
  })

  // Mining Coin edit
  const currentMiningTotal = (user?.mining?.mined_coins || 0) + (user?.mining?.adjustments || 0)
  const [editingMining, setEditingMining] = useState(false)
  const [miningTarget, setMiningTarget] = useState<string>(() => String(currentMiningTotal || 0))
  useEffect(() => { setMiningTarget(String(currentMiningTotal || 0)) }, [currentMiningTotal])

  // Coin Balance edit
  const [editingCoin, setEditingCoin] = useState(false)
  const [coinTarget, setCoinTarget] = useState<string>(() => String(user?.coin_balance ?? 0))
  useEffect(() => { setCoinTarget(String(user?.coin_balance ?? 0)) }, [user?.coin_balance])

  // Miners
  const [miners, setMiners] = useState<MiningHistoryItem[]>([])
  const [loadingMiners, setLoadingMiners] = useState(false)

  const fetchMiners = async () => {
    if (!wallet || !isValidAddress(wallet)) return
    setLoadingMiners(true)
    try {
      const res = await getMiningHistory(wallet)
      setMiners(res.data.items || [])
    } catch { setMiners([]) } finally { setLoadingMiners(false) }
  }

  // Refresh user (background; UI খোলা/দেখার জন্য কোনো সিগনেচার লাগবে না, তবে backend এই রুটে owner চেক করে)
  const refreshUser = async () => {
    if (!adminAddress || !(wallet || uid)) return
    try {
      const { ethers, BrowserProvider } = await import('ethers')
      const provider = new BrowserProvider((window as any).ethereum)
      const signer = await provider.getSigner()
      const ts = Math.floor(Date.now() / 1000)
      const message = `Admin action authorization
Purpose: user_info
Address: ${ethers.getAddress(adminAddress)}
Timestamp: ${ts}`
      const signature = await signer.signMessage(message)
      const payload: any = { address: adminAddress, timestamp: ts, signature }
      if (wallet && isValidAddress(wallet)) payload.wallet = wallet
      else if (uid) payload.user_id = uid
      const res = await getAdminUserInfo(payload)
      if (res.data?.ok && res.data?.user) setUser(res.data.user)
    } catch {}
  }

  useEffect(() => {
    if (!open) return
    setUser(initialUser || null)
    fetchMiners()
    refreshUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUser?.wallet_address, initialUser?.user_id])

  // Save Mining Coin (write → signature)
  const onSaveMiningEdit = async () => {
    if (!user) return
    const target = Number(miningTarget)
    if (!Number.isFinite(target)) { showErrorToast('Enter a valid number'); return }
    try {
      const { timestamp, signature } = await signAdminAction('mining_edit', adminAddress)
      const res = await adminMiningEdit({ address: adminAddress, timestamp, signature, wallet: user.wallet_address, set_to: Math.floor(target), reason: 'mining_correction' })
      const d = res.data
      if (d?.ok) { showSuccessToast(`Mining coin set → ${d.new_total} (Δ ${d.delta>=0?'+':''}${d.delta})`); setEditingMining(false); await refreshUser() }
      else showErrorToast('Failed to set mining coin')
    } catch (e) { showErrorToast(e, 'Failed to set mining coin') }
  }

  // Save Coin Balance (set-to via delta) (write → signature)
  const onSaveCoinEdit = async () => {
    if (!user) return
    const target = Math.floor(Number(coinTarget))
    if (!Number.isFinite(target) || target < 0) { showErrorToast('Enter a valid non-negative integer'); return }
    const current = Number(user.coin_balance || 0)
    const delta = target - current
    if (delta === 0) { setEditingCoin(false); return }
    if (Math.abs(delta) > 100000 && !window.confirm(`Large change Δ ${delta}. Proceed?`)) return
    try {
      const { timestamp, signature } = await signAdminAction('adjust_coins', adminAddress)
      const res = await adjustUserCoins({ address: adminAddress, timestamp, signature, wallet: user.wallet_address, delta: Math.trunc(delta), reason: `coin_set_to:${target}` })
      if (res.data?.ok) { showSuccessToast(`Coin balance set → ${target} (Δ ${delta>=0?'+':''}${delta})`); setEditingCoin(false); await refreshUser() }
      else showErrorToast('Failed to set coin balance')
    } catch (e) { showErrorToast(e, 'Failed to set coin balance') }
  }

  // Per-miner Fix / Delete (write → signature)
  const onFixMiner = async (m: MiningHistoryItem) => {
    if (!user) return
    try {
      const { timestamp, signature } = await signAdminAction('miner_fix', adminAddress)
      const res = await adminMinerFix({ address: adminAddress, timestamp, signature, wallet: user.wallet_address, id: m.id })
      const d = res.data
      if (d?.ok) { showSuccessToast(`Miner fixed • daily=${d.miner.daily_coins} • credited +${d.credited_now}`); await fetchMiners(); await refreshUser() }
      else showErrorToast('Miner fix failed')
    } catch (e) { showErrorToast(e, 'Miner fix failed') }
  }
  const onDeleteMiner = async (m: MiningHistoryItem) => {
    if (!user) return
    if (!window.confirm(`Delete miner #${m.id}? Already-credited coins will be deducted.`)) return
    try {
      const { timestamp, signature } = await signAdminAction('miner_remove', adminAddress)
      const res = await adminMinerRemove({ address: adminAddress, timestamp, signature, wallet: user.wallet_address, id: m.id })
      const d = res.data
      if (d?.ok) { showSuccessToast(`Miner removed • deducted ${d.deducted} coins`); await fetchMiners(); await refreshUser() }
      else showErrorToast('Failed to remove miner')
    } catch (e) { showErrorToast(e, 'Failed to remove miner') }
  }

  // Add Miner modal (open → no signature; submit → signature)
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
        address: adminAddress, timestamp, signature, wallet: user.wallet_address,
        mode, tx_hash: mode==='verify'?txHash:undefined,
        amount_usd: mode==='force'?Math.floor(Number(amountUsd||'0')):undefined,
        start_date: mode==='force'?(startDate||undefined):undefined,
        total_days: Number(totalDays||'30'),
      })
      const d = res.data as any
      if (d?.ok) {
        showSuccessToast(`Miner added • daily=${d.daily_coins} • credited ${d.credited_now} (${d.mode})`)
        setShowAdd(false); setTxHash(''); setAmountUsd(''); setStartDate(''); setTotalDays('30'); setMode('verify')
        await fetchMiners(); await refreshUser()
      } else showErrorToast(d?.error || 'Add miner failed')
    } catch (e) { showErrorToast(e, 'Add miner failed') }
  }

  if (!open) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="lxr-surface" style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className="lxr-surface-lines" />
        <div className="lxr-surface-mesh" />
        <div className="lxr-surface-circuit" />
        <div className="lxr-surface-holo" />
        <div style={{ position: 'relative', zIndex: 2, padding: pad }}>
          {/* Top bar */}
          <div style={styles.headerTop}>
            <div style={styles.headerId}>
              <span>User ID: {user?.user_id || '-'}</span>
              <span style={styles.walletLine} title={user?.wallet_address || ''}>
                Wallet: {user?.wallet_address || '-'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.addBtn} onClick={() => setShowAdd(true)}>
                <PlusIcon size={isXs?14:16} /> <span>Add Miner</span>
              </button>
              <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
            </div>
          </div>

          {/* Summary (mobile-first) */}
          <Surface>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={styles.infoRow}><div style={styles.infoKey}>Wallet Balance</div><div style={styles.infoVal}>${safeMoney(usdtBalance)} {isFetchingOnChain && <span style={styles.small}>updating</span>}</div></div>

              {/* Coin Balance with inline edit */}
              <div style={styles.infoRow}>
                <div style={styles.infoKey}>Coin Balance</div>
                <div>
                  {!editingCoin ? (
                    <div style={styles.editRow}>
                      <div style={{ fontWeight: 900, fontSize: fontBig }}>{user?.coin_balance ?? 0}</div>
                      <button title="Edit coin balance" aria-label="Edit coin balance" style={styles.iconBtn} onClick={() => setEditingCoin(true)}>
                        <PencilIcon size={isXs?16:18} />
                      </button>
                    </div>
                  ) : (
                    <div style={styles.editRow}>
                      <input style={styles.editInput} value={coinTarget} onChange={(e) => setCoinTarget(e.target.value.replace(/[^\d]/g, ''))} placeholder="Set coin to" />
                      <button style={styles.saveBtn} onClick={onSaveCoinEdit}>
                        <CheckIcon size={isXs?14:18} /> <span>Save</span>
                      </button>
                      <button style={styles.closeBtn} onClick={() => { setEditingCoin(false); setCoinTarget(String(user?.coin_balance ?? 0)) }}>✕</button>
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.infoRow}><div style={styles.infoKey}>Total Login</div><div style={styles.infoVal}>{user?.logins ?? 0} day</div></div>
              <div style={styles.infoRow}><div style={styles.infoKey}>Referral Coin</div><div style={styles.infoVal}>{user?.referral_coins ?? 0}</div></div>
              <div style={styles.infoRow}><div style={styles.infoKey}>Total Refer</div><div style={styles.infoVal}>{user?.l1_count ?? 0}</div></div>

              {/* Mining Coin with edit icon */}
              <div style={styles.infoRow}>
                <div style={styles.infoKey}>Mining Coin</div>
                <div>
                  {!editingMining ? (
                    <div style={styles.editRow}>
                      <div style={{ fontWeight: 900, fontSize: fontBig }}>{currentMiningTotal}</div>
                      <button title="Edit mining coin" aria-label="Edit mining coin" style={styles.iconBtn} onClick={() => setEditingMining(true)}>
                        <PencilIcon size={isXs?16:18} />
                      </button>
                    </div>
                  ) : (
                    <div style={styles.editRow}>
                      <input style={styles.editInput} value={miningTarget} onChange={(e) => setMiningTarget(e.target.value.replace(/[^\d-]/g, ''))} placeholder="Set mining to" />
                      <button style={styles.saveBtn} onClick={onSaveMiningEdit}>
                        <CheckIcon size={isXs?14:18} /> <span>Save</span>
                      </button>
                      <button style={styles.closeBtn} onClick={() => { setEditingMining(false); setMiningTarget(String(currentMiningTotal || 0)) }}>✕</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Surface>

          {/* Miners */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
            <div style={{ fontWeight: 900, fontSize: isXs ? 14 : 16 }}>Miners</div>
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
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
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
                            {m.tx_hash.slice(0, 6)}...{m.tx_hash.slice(-6)}
                          </a>
                        ) : <span style={{ color: colors.textMuted }}>N/A</span>}
                      </td>
                      <td style={styles.td}>{m.daily_coins} USDT</td>
                      <td style={styles.td}>{m.daily_coins * m.credited_days}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button title="Fix this miner" aria-label="Fix miner" style={styles.iconBtn} onClick={() => onFixMiner(m)}>
                            <FixIcon size={isXs?16:18} />
                          </button>
                          <button title="Delete this miner" aria-label="Delete miner" style={styles.iconBtnDanger} onClick={() => onDeleteMiner(m)}>
                            <TrashIcon size={isXs?16:18} />
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
            <div style={{ position: 'relative', zIndex: 2, padding: pad }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={styles.sectionTitle}>Add Miner</div>
                <button style={styles.closeBtn} onClick={() => setShowAdd(false)} aria-label="Close">✕</button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  style={{ ...styles.saveBtn, ...(mode === 'verify' ? {} : { opacity: 0.6 }) }}
                  onClick={() => setMode('verify')}
                >
                  Verify
                </button>
                <button
                  style={{ ...styles.saveBtn, background: 'linear-gradient(45deg,#64748b,#cbd5e1)', color: '#0b1b3b', ...(mode === 'force' ? {} : { opacity: 0.6 }) }}
                  onClick={() => setMode('force')}
                >
                  Force
                </button>
              </div>

              {mode === 'verify' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  <input style={styles.input} placeholder="Tx hash (0x...)" value={txHash} onChange={(e) => setTxHash(e.target.value.trim())} />
                  <button className="lxr-buy-btn" disabled={addingDisabled} onClick={onAddMiner}>Add (Verify)</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isSm ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                  <input style={styles.input} placeholder="Amount (USD)" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value.replace(/[^\d]/g, ''))} />
                  <input style={styles.input} placeholder="Start date (YYYY-MM-DD)" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <input style={styles.input} placeholder="Total days (default 30)" value={totalDays} onChange={(e) => setTotalDays(e.target.value.replace(/[^\d]/g, ''))} />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <button className="lxr-buy-btn" disabled={addingDisabled} onClick={onAddMiner}>Add (Force)</button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 8, ...styles.small }}>
                Verify mode checks the on-chain tx and user match. Force mode skips checks (use with care).
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserDetailModal
