import React, { useMemo, useState } from 'react'
import { ethers, BrowserProvider } from 'ethers'
import { isValidAddress } from '../../utils/wallet'
import {
  getAdminUserInfo,
  adjustUserCoins,
  adminMinerAdd,
  adminMinerRemove,
  getMiningHistory,
  type MiningHistoryItem,
} from '../../services/api'
import { showErrorToast, showSuccessToast } from '../../utils/notification'

// Local theme
const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  danger: '#ef4444',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
  accentSoft: '#e0f5ed',
}

const styles: Record<string, React.CSSProperties> = {
  input: {
    height: 40,
    borderRadius: 10,
    border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px',
    background: 'rgba(255,255,255,0.05)',
    outline: 'none',
    color: colors.text,
    fontSize: 14,
    width: '100%',
  },
  small: { fontSize: 12, color: colors.textMuted },
  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` },
  buttonGhost: {
    height: 44,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    color: colors.text,
    border: `1px solid ${colors.grayLine}`,
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    padding: '0 12px',
  },
}

const Surface: React.FC<{ children: React.ReactNode; title?: string; sub?: string }> = ({ children, title, sub }) => (
  <div className="lxr-surface">
    <div className="lxr-surface-lines" />
    <div className="lxr-surface-mesh" />
    <div className="lxr-surface-circuit" />
    <div className="lxr-surface-holo" />
    <div style={{ position: 'relative', zIndex: 2 }}>
      {title && (
        <div style={{ fontWeight: 900, marginBottom: 6 }}>
          {title} {sub && <span style={{ ...styles.small, marginLeft: 6 }}>{sub}</span>}
        </div>
      )}
      {children}
    </div>
  </div>
)

// Exact admin-sign message (must match backend)
async function signAdminAction(
  purpose: 'user_info' | 'adjust_coins' | 'miner_add' | 'miner_remove',
  adminAddress: string
) {
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

type Props = {
  allow: boolean
  adminAddress: string
}

const UserToolsCard: React.FC<Props> = ({ allow, adminAddress }) => {
  const [mode, setMode] = useState<'uid' | 'wallet'>('uid')
  const [query, setQuery] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(false)
  const [user, setUser] = useState<null | {
    user_id: string
    wallet_address: string
    coin_balance: number
    logins: number
    referral_coins: number
    mining: { purchases: number; mined_coins: number }
    created_at: string
  }>(null)

  const [miners, setMiners] = useState<MiningHistoryItem[]>([])
  const [isLoadingMiners, setIsLoadingMiners] = useState(false)

  // Adjust coins form
  const [delta, setDelta] = useState<string>('0')
  const [reason, setReason] = useState<string>('manual correction')

  // Add miner form
  const [amountUsd, setAmountUsd] = useState<string>('5')
  const [startDate, setStartDate] = useState<string>('') // YYYY-MM-DD
  const [totalDays, setTotalDays] = useState<string>('30')
  const [txRef, setTxRef] = useState<string>('')

  const canSearch = useMemo(() => {
    if (mode === 'uid') return query.trim().length >= 6 && query.trim().length <= 8
    return isValidAddress(query.trim())
  }, [mode, query])

  const fetchMiners = async (wallet: string) => {
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

  const onSearch = async () => {
    if (!allow) { showErrorToast('Not allowed'); return }
    if (!adminAddress) { showErrorToast('Connect admin wallet'); return }
    if (!canSearch) { showErrorToast('Enter valid UID (6–8) or Wallet'); return }

    setLoading(true)
    try {
      const { timestamp, signature } = await signAdminAction('user_info', adminAddress)
      const payload: any = { address: adminAddress, timestamp, signature }
      if (mode === 'uid') payload.user_id = query.trim().toUpperCase()
      else payload.wallet = query.trim().toLowerCase()

      const res = await getAdminUserInfo(payload)
      const data = res.data
      if (!data?.ok || !data?.user) {
        showErrorToast('User not found')
        setUser(null)
        setMiners([])
        return
      }
      setUser(data.user)
      await fetchMiners(data.user.wallet_address)
    } catch (e) {
      showErrorToast(e, 'Failed to fetch user info')
    } finally {
      setLoading(false)
    }
  }

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
      const out = res.data
      if (out?.ok) {
        setUser({ ...user, coin_balance: out.coin_balance })
        showSuccessToast('Coin balance updated')
      } else {
        showErrorToast('Adjustment failed')
      }
    } catch (e) {
      showErrorToast(e, 'Adjustment failed')
    }
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
        await fetchMiners(user.wallet_address)
      } else {
        showErrorToast('Failed to add miner')
      }
    } catch (e) {
      showErrorToast(e, 'Failed to add miner')
    }
  }

  const onRemoveMiner = async (id: number) => {
    if (!user) return
    if (!window.confirm(`Remove miner #${id}? This will deduct already credited coins from user balance.`)) return
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
        await fetchMiners(user.wallet_address)
      } else {
        showErrorToast('Failed to remove miner')
      }
    } catch (e) {
      showErrorToast(e, 'Failed to remove miner')
    }
  }

  return (
    <Surface title="User Tools" sub="Lookup by UID/Wallet • Adjust coins • Add/Remove miner">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
        {/* Search controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              style={{ ...styles.buttonGhost, ...(mode === 'uid' ? { borderColor: colors.accent } : {}) }}
              onClick={() => setMode('uid')}
            >
              By UID
            </button>
            <button
              style={{ ...styles.buttonGhost, ...(mode === 'wallet' ? { borderColor: colors.accent } : {}) }}
              onClick={() => setMode('wallet')}
            >
              By Wallet
            </button>
          </div>
          <input
            style={styles.input}
            placeholder={mode === 'uid' ? 'Enter UID (6–8 chars)' : '0x... wallet'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="lxr-buy-btn" onClick={onSearch} disabled={!allow || loading || !adminAddress || !query}>
            {loading ? 'SEARCHING...' : 'Search'}
          </button>
        </div>

        {/* User summary */}
        {!user ? (
          <div style={{ ...styles.small, color: colors.textMuted }}>No user selected</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <tbody>
                  <tr><td style={styles.td}><b>UID</b></td><td style={styles.td}>{user.user_id}</td></tr>
                  <tr><td style={styles.td}><b>Wallet</b></td><td style={styles.td}><span title={user.wallet_address}>{user.wallet_address}</span></td></tr>
                  <tr><td style={styles.td}><b>Coins</b></td><td style={styles.td}>{user.coin_balance}</td></tr>
                  <tr><td style={styles.td}><b>Logins</b></td><td style={styles.td}>{user.logins}</td></tr>
                  <tr><td style={styles.td}><b>Referral coins</b></td><td style={styles.td}>{user.referral_coins}</td></tr>
                  <tr><td style={styles.td}><b>Mining (purchases)</b></td><td style={styles.td}>{user.mining.purchases} • mined={user.mining.mined_coins}</td></tr>
                  <tr><td style={styles.td}><b>Joined</b></td><td style={styles.td}>{user.created_at}</td></tr>
                </tbody>
              </table>
            </div>

            {/* Adjust coins */}
            <div style={{ borderTop: `1px solid ${colors.grayLine}`, paddingTop: 8 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Adjust Coins</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                <input style={styles.input} placeholder="Delta (+/- integer)" value={delta} onChange={(e) => setDelta(e.target.value)} />
                <input style={styles.input} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="lxr-buy-btn" onClick={onAdjustCoins}>Apply</button>
              </div>
              <div style={{ ...styles.small, marginTop: 6 }}>Security: owner-signed, audited on backend.</div>
            </div>

            {/* Add miner */}
            <div style={{ borderTop: `1px solid ${colors.grayLine}`, paddingTop: 8 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Add Miner</div>
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
            <div style={{ borderTop: `1px solid ${colors.grayLine}`, paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 900 }}>Miners</div>
                <button className="lxr-buy-btn" onClick={() => fetchMiners(user.wallet_address)} disabled={isLoadingMiners}>
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
    </Surface>
  )
}

export default UserToolsCard
