import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import {
  getOwner,
  isAdmin as isAdminOnChain,
  getAdminCommission,
  getContractBalance,
  withdrawCommission,
  emergencyWithdrawAll,
  withdrawLiquidity,
  getTotalCollected,
} from '../utils/contract'
import {
  createNotice,
  updateNotice,
  deleteNotice,
  getAdminNotices,
  type AdminNotice,
  getAdminOverview,
  type AdminOverviewResponse,
  getAdminUserInfo,
  type AdminUserInfo,
  adjustUserCoins,
  adminAddMiner,
  adminRemoveMiner,
  getMiningHistory,
  type MiningHistoryItem,
} from '../services/api'
import { showSuccessToast, showErrorToast } from '../utils/notification'
import { ethers, BrowserProvider } from 'ethers'

// Theme colors
const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  danger: '#ef4444',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
  accentSoft: '#e0f5ed',
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', width: '100%' },
  container: { maxWidth: 880, margin: '0 auto', padding: '16px 12px 96px' },

  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 12, flexWrap: 'wrap', color: colors.text,
  },
  brand: { fontWeight: 900, fontSize: 18, letterSpacing: 1 },

  userMenuWrap: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8 },
  userIdText: { fontWeight: 800, fontSize: 13, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userMenuBtn: {
    width: 34, height: 34, borderRadius: '50%', border: `1px solid ${colors.grayLine}`,
    background: 'rgba(255,255,255,0.06)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: colors.text,
  },
  dropdown: {
    position: 'absolute', right: 0, top: 40, background: 'rgba(15,31,63,0.98)',
    border: `1px solid ${colors.grayLine}`, borderRadius: 10,
    boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
    padding: 6, minWidth: 140, zIndex: 100, backdropFilter: 'blur(8px)', color: colors.text,
  },
  dropdownItem: {
    width: '100%', textAlign: 'left' as const, padding: '8px 10px',
    borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 800, color: colors.text,
  },

  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'stretch' },

  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },
  textarea: {
    minHeight: 120, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: 10, background: 'rgba(255,255,255,0.05)', color: colors.text, fontFamily: 'monospace', fontSize: 13,
  },
  small: { fontSize: 12, color: colors.textMuted },

  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` },

  button: {
    height: 44, borderRadius: 10,
    background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`,
    color: '#0b1b3b', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px',
    boxShadow: '0 4px 15px rgba(20,184,166,0.3)',
  },
  buttonGhost: {
    height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`,
    fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px',
  },
  buttonDanger: {
    height: 44, borderRadius: 10, background: '#b91c1c', color: '#fff', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px',
  },

  // Bottom nav
  bottomNavWrap: { position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 880, padding: '0 12px', zIndex: 200 },
  bottomNav: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  navBtn: { height: 48, borderRadius: 12, border: `1px solid ${colors.grayLine}`, background: 'rgba(255,255,255,0.06)', fontWeight: 800, cursor: 'pointer', color: colors.text, display: 'grid', placeItems: 'center' },
  navBtnActive: { background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`, color: '#0b1b3b', borderColor: colors.accent },
}

// Surface wrapper
const Surface: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; title?: string; sub?: string }> = ({ children, style, title, sub }) => (
  <div className="lxr-surface" style={style}>
    <div className="lxr-surface-lines" /><div className="lxr-surface-mesh" /><div className="lxr-surface-circuit" /><div className="lxr-surface-holo" />
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

// Icons
const IconHome: React.FC<{ size?: number }> = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5v8.5a2 2 0 0 1-2 2h-5v-6H10v6H5a2 2 0 0 1-2-2v-8.5z" fill="currentColor"/></svg>)
const IconFinance: React.FC<{ size?: number }> = ({ size = 20 }) => (<svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M3 17h18v2H3v-2zm2-3h3v3H5v-3zm5-4h3v7h-3V10zm5-5h3v12h-3V5z" fill="currentColor"/></svg>)
const IconUser: React.FC<{ size?: number }> = ({ size = 18 }) => (<svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M12 12a5 5 0 1 0-5-5 5.006 5.006 0 0 0 5 5zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14z" fill="currentColor"/></svg>)

const AdminDashboard: React.FC = () => {
  const { account, disconnect } = useWallet()
  const navigate = useNavigate()

  // UI state
  const [activeTab, setActiveTab] = useState<'home' | 'finance'>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  }, [])

  // Role check
  const { data: role } = useQuery<{ isAdmin: boolean; isOwner: boolean }>({
    queryKey: ['adminRole', account],
    enabled: !!account,
    queryFn: async () => {
      if (!account) return { isAdmin: false, isOwner: false }
      const [owner, adminFlag] = await Promise.all([getOwner(), isAdminOnChain(account)])
      const isOwner = owner.toLowerCase() === account.toLowerCase()
      return { isAdmin: adminFlag || isOwner, isOwner }
    },
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (!account) { navigate('/login', { replace: true }); return }
    if (role && !role.isAdmin && !role.isOwner) { navigate('/dashboard', { replace: true }) }
  }, [account, role, navigate])

  const allow = !!account && !!role && (role.isAdmin || role.isOwner)

  // Sign helper
  const signAdminAction = async (purpose: string) => {
    const provider = new BrowserProvider((window as any).ethereum)
    const signer = await provider.getSigner()
    const ts = Math.floor(Date.now() / 1000)
    const message = `Admin action authorization
Purpose: ${purpose}
Address: ${ethers.getAddress(signer.address)}
Timestamp: ${ts}`
    const signature = await signer.signMessage(message)
    return { address: signer.address, timestamp: ts, signature }
  }

  // Finance queries
  const { data: finance } = useQuery({
    queryKey: ['adminFinance', account],
    enabled: allow,
    refetchInterval: 20000,
    queryFn: async () => {
      const [commission, balance, totalCollected] = await Promise.all([getAdminCommission(account!), getContractBalance(), getTotalCollected()])
      return { commission, balance, totalCollected }
    },
  })
  
  // Analysis (Total users, coins)
  const { data: overview } = useQuery<AdminOverviewResponse>({
    queryKey: ['adminOverview'],
    enabled: allow,
    refetchInterval: 60000,
    queryFn: async () => (await getAdminOverview()).data,
  })

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <div className="lxr-lexori-logo" style={styles.brand as any}>Admin Console</div>
          <div style={styles.userMenuWrap} ref={menuRef}>
            <span style={styles.userIdText} title={account || ''}>{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : ''}</span>
            <button style={styles.userMenuBtn} onClick={() => setMenuOpen(v => !v)}><IconUser size={18} /></button>
            {menuOpen && (
              <div style={styles.dropdown} role="menu">
                <button style={styles.dropdownItem} onClick={() => { setMenuOpen(false); disconnect() }}>Logout</button>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'home' ? <HomeTab signHelper={signAdminAction} /> : <FinanceTab finance={finance} overview={overview} />}

        {/* Bottom nav */}
        <div style={styles.bottomNavWrap}>
          <div className="lxr-surface" style={{ padding: 8, borderRadius: 14 }}>
            <div className="lxr-surface-lines" /><div className="lxr-surface-mesh" /><div className="lxr-surface-circuit" /><div className="lxr-surface-holo" />
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={styles.bottomNav}>
                <button style={{ ...styles.navBtn, ...(activeTab === 'home' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('home')}><IconHome size={20} /></button>
                <button style={{ ...styles.navBtn, ...(activeTab === 'finance' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('finance')}><IconFinance size={20} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const HomeTab: React.FC<{ signHelper: any }> = ({ signHelper }) => {
  // Notices state
  const [postTab, setPostTab] = useState<'image' | 'script'>('image')
  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [scriptContent, setScriptContent] = useState('')
  const [expireMinutes, setExpireMinutes] = useState<string>('')
  const [isPosting, setIsPosting] = useState(false)
  
  // Notices list
  const { data: adminList = [], refetch: refetchAdminList, isFetching: isListFetching } = useQuery<AdminNotice[]>({
    queryKey: ['adminNotices'],
    refetchInterval: 30000,
    queryFn: async () => (await getAdminNotices(150)).data.notices || [],
  })

  // Notice handlers
  const onPostNotice = async () => {
    try {
      setIsPosting(true)
      const auth = await signHelper('create_notice')
      const expires_in_sec = Number.isFinite(Number(expireMinutes || '0')) && Number(expireMinutes || '0') > 0 ? Math.round(Number(expireMinutes) * 60) : undefined

      if (postTab === 'image') {
        if (!imageUrl.trim()) { showErrorToast('Please provide image URL'); return }
        await createNotice({ ...auth, kind: 'image', image_url: imageUrl.trim(), link_url: (linkUrl || '').trim(), is_active: true, ...(expires_in_sec ? { expires_in_sec } : {}) })
      } else {
        if (!scriptContent.trim()) { showErrorToast('Please provide script content'); return }
        await createNotice({ ...auth, kind: 'script', content_html: scriptContent, is_active: true, ...(expires_in_sec ? { expires_in_sec } : {}) })
      }
      showSuccessToast('Notice posted')
      setImageUrl(''); setLinkUrl(''); setScriptContent(''); setExpireMinutes('')
      refetchAdminList()
    } catch (e) {
      showErrorToast(e, 'Failed to post notice')
    } finally {
      setIsPosting(false)
    }
  }

  const deleteOne = async (id: number) => {
    if (!window.confirm('Delete this notice?')) return
    try {
      const auth = await signHelper('delete_notice')
      await deleteNotice(id, auth)
      showSuccessToast('Deleted')
      refetchAdminList()
    } catch (e) {
      showErrorToast(e, 'Failed to delete')
    }
  }

  const setExpiryMinutes = async (id: number, minutes: number) => {
    if (!(minutes > 0)) { showErrorToast('Enter minutes > 0'); return }
    try {
      const auth = await signHelper('update_notice')
      await updateNotice(id, { ...auth, expires_in_sec: Math.round(minutes * 60) })
      showSuccessToast('Expiry set')
      refetchAdminList()
    } catch (e) {
      showErrorToast(e, 'Failed to set expiry')
    }
  }

  return (
    <div style={styles.grid}>
      {/* Post Notice */}
      <Surface title="Post Notice" sub="Image or Script • optional expiry (minutes)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 8 }}>
          <button style={{ ...styles.buttonGhost, ...(postTab === 'image' ? { borderColor: colors.accent } : {}) }} onClick={() => setPostTab('image')}>Image</button>
          <button style={{ ...styles.buttonGhost, ...(postTab === 'script' ? { borderColor: colors.accent } : {}) }} onClick={() => setPostTab('script')}>Script</button>
        </div>

        {postTab === 'image' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <div><div style={styles.small}>Image URL</div><input style={styles.input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." /></div>
            <div><div style={styles.small}>Link URL (on click)</div><input style={styles.input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." /></div>
            <div><div style={styles.small}>Expires in (minutes)</div><input style={styles.input} value={expireMinutes} onChange={(e) => setExpireMinutes(e.target.value)} placeholder="e.g., 60" /></div>
            <div><button className="lxr-buy-btn" onClick={onPostNotice} disabled={isPosting}>{isPosting ? 'POSTING...' : 'Post Image Notice'}</button></div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <div><div style={styles.small}>Script content</div><textarea style={styles.textarea} value={scriptContent} onChange={(e) => setScriptContent(e.target.value)} placeholder={`console.log('Hello');`} /></div>
            <div><div style={styles.small}>Expires in (minutes)</div><input style={styles.input} value={expireMinutes} onChange={(e) => setExpireMinutes(e.target.value)} placeholder="e.g., 120" /></div>
            <div><button className="lxr-buy-btn" onClick={onPostNotice} disabled={isPosting}>{isPosting ? 'POSTING...' : 'Post Script Notice'}</button></div>
          </div>
        )}
      </Surface>

      {/* Manage Notices */}
      <Surface title="Manage Notices" sub={isListFetching ? 'Refreshing…' : `Total: ${adminList.length}`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead><tr><th style={styles.th}>ID</th><th style={styles.th}>Kind</th><th style={styles.th}>Status</th><th style={styles.th}>Preview</th><th style={styles.th}>Expires</th><th style={{ ...styles.th, textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {(adminList || []).map((n) => {
                const isExpired = !!n.expires_at && new Date(n.expires_at).getTime() <= Date.now()
                const statusText = isExpired ? 'Expired' : (n.is_active ? 'Active' : 'Inactive')
                const expires = n.expires_at ? new Date(n.expires_at).toLocaleString() : '—'
                const preview = n.kind === 'image' ? (n.image_url || '').slice(0, 32) : (n.content_html || '').slice(0, 32)
                return (
                  <tr key={n.id}>
                    <td style={styles.td}>{n.id}</td><td style={styles.td}>{n.kind}</td>
                    <td style={styles.td}><span style={{ color: isExpired ? colors.textMuted : colors.accent, fontWeight: 800 }}>{statusText}</span></td>
                    <td style={styles.td} title={n.kind === 'image' ? (n.image_url || '') : ''}>{preview || '—'}</td>
                    <td style={styles.td}>{expires}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <QuickExpiry onSet={async (mins) => setExpiryMinutes(n.id, mins)} />
                        <button style={styles.buttonDanger} onClick={() => deleteOne(n.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {(!adminList || adminList.length === 0) && (<tr><td colSpan={6} style={{ ...styles.td, color: colors.textMuted }}>No notices</td></tr>)}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  )
}

const FinanceTab: React.FC<{ finance: any, overview: any }> = ({ finance, overview }) => {
  const [liqAmount, setLiqAmount] = useState<string>('')

  const handleWithdrawCommission = async () => {
    try { const tx = await withdrawCommission(); if ((tx as any)?.wait) await (tx as any).wait(); showSuccessToast('Commission withdrawn') } catch (e) { showErrorToast(e, 'Commission withdrawal failed') }
  }
  const handleEmergencyWithdrawAll = async () => {
    if (!window.confirm('Withdraw all contract funds to owner wallet?')) return
    try { const tx = await emergencyWithdrawAll(); if ((tx as any)?.wait) await (tx as any).wait(); showSuccessToast('Emergency withdraw completed') } catch (e) { showErrorToast(e, 'Emergency withdraw failed') }
  }
  const handleWithdrawLiquidity = async () => {
    if (Number(liqAmount || '0') <= 0) { showErrorToast('Enter a valid amount'); return }
    try { const tx = await withdrawLiquidity(liqAmount); if ((tx as any)?.wait) await (tx as any).wait(); showSuccessToast('Liquidity withdrawn'); setLiqAmount('') } catch (e) { showErrorToast(e, 'Liquidity withdraw failed') }
  }

  return (
    <div style={styles.grid}>
      <Surface title="Total Commission"><div style={styles.small}>${Number(finance?.commission || 0).toFixed(2)}</div><button className="lxr-buy-btn" onClick={handleWithdrawCommission}>Withdraw Commission</button></Surface>
      <Surface title="Contract Balance"><div style={styles.small}>${Number(finance?.balance || 0).toFixed(2)}</div><button style={styles.buttonDanger} onClick={handleEmergencyWithdrawAll}>Emergency Withdraw All</button></Surface>
      <Surface title="Total Liquidity (miners)"><div style={styles.small}>${Number(finance?.totalCollected || 0).toFixed(2)}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}><input style={styles.input} placeholder="Amount in USDT" value={liqAmount} onChange={(e) => setLiqAmount(e.target.value)} /><button className="lxr-buy-btn" onClick={handleWithdrawLiquidity}>Withdraw Liquidity</button></div></Surface>
      <UserTools />
      <Surface title="Analysis"><div style={styles.small}>Total users: <strong style={{ color: colors.accent }}>{overview?.total_users ?? 0}</strong> • Total coins: <strong style={{ color: colors.accent }}>{Number(overview?.total_coins || 0).toFixed(0)}</strong></div></Surface>
    </div>
  )
}

const UserTools: React.FC = () => {
  const { account } = useWallet()
  const [query, setQuery] = useState('')
  const [searchedUser, setSearchedUser] = useState<AdminUserInfo | null>(null)
  const [history, setHistory] = useState<MiningHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const sign = async (purpose: string) => {
    const provider = new BrowserProvider((window as any).ethereum)
    const signer = await provider.getSigner()
    const ts = Math.floor(Date.now() / 1000)
    const msg = `Admin action authorization
Purpose: ${purpose}
Address: ${ethers.getAddress(signer.address)}
Timestamp: ${ts}`
    return { address: signer.address, timestamp: ts, signature: await signer.signMessage(msg) }
  }
  
  const search = async () => {
    if (!query.trim()) return
    setIsLoading(true)
    setSearchedUser(null)
    setHistory([])
    try {
      const auth = await sign('user_info')
      const q = ethers.isAddress(query) ? { wallet: query.trim() } : { user_id: query.trim() }
      const res = await getAdminUserInfo({ ...auth, ...q })
      setSearchedUser(res.data.user)
      const histRes = await getMiningHistory(res.data.user.wallet_address)
      setHistory(histRes.data.items || [])
    } catch (e) {
      showErrorToast(e, 'Failed to find user')
    } finally {
      setIsLoading(false)
    }
  }

  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const adjust = async (val: number) => {
    if (!searchedUser) return
    setIsUpdating(true)
    try {
      const auth = await sign('adjust_coins')
      await adjustUserCoins({ ...auth, wallet: searchedUser.wallet_address, delta: val, reason })
      showSuccessToast('Coins adjusted')
      setDelta(''); setReason(''); search()
    } catch (e) {
      showErrorToast(e, 'Failed to adjust coins')
    } finally {
      setIsUpdating(false)
    }
  }

  const [addAmount, setAddAmount] = useState('')
  const [addTx, setAddTx] = useState('')
  const addMiner = async () => {
    if (!searchedUser || !addAmount) return
    setIsUpdating(true)
    try {
      const auth = await sign('miner_add')
      await adminAddMiner({ ...auth, wallet: searchedUser.wallet_address, amount_usd: Number(addAmount), tx_hash: addTx || `admin_add_${Date.now()}` })
      showSuccessToast('Miner added')
      setAddAmount(''); setAddTx(''); search()
    } catch (e) {
      showErrorToast(e, 'Failed to add miner')
    } finally {
      setIsUpdating(false)
    }
  }

  const removeMiner = async (id: number) => {
    if (!searchedUser || !window.confirm(`Remove miner #${id}?`)) return
    setIsUpdating(true)
    try {
      const auth = await sign('miner_remove')
      await adminRemoveMiner({ ...auth, wallet: searchedUser.wallet_address, id })
      showSuccessToast('Miner removed')
      search()
    } catch (e) {
      showErrorToast(e, 'Failed to remove miner')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Surface title="User Tools">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
        <input style={styles.input} placeholder="User ID or Wallet Address" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="lxr-buy-btn" onClick={search} disabled={isLoading}>{isLoading ? 'SEARCHING...' : 'Search'}</button>
      </div>

      {searchedUser && (
        <div style={{ borderTop: `1px solid ${colors.grayLine}`, paddingTop: 8 }}>
          <p><strong>User:</strong> {searchedUser.user_id} • <strong>Wallet:</strong> {searchedUser.wallet_address.slice(0, 6)}…{searchedUser.wallet_address.slice(-4)}</p>
          <p><strong>Coin Balance:</strong> {searchedUser.coin_balance} • <strong>Logins:</strong> {searchedUser.logins} • <strong>Referral Coins:</strong> {searchedUser.referral_coins}</p>
          
          {/* Adjust Coins */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input style={styles.input} placeholder="Coin delta (+/-)" value={delta} onChange={(e) => setDelta(e.target.value)} />
            <input style={styles.input} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="lxr-buy-btn" onClick={() => adjust(Number(delta || '0'))} disabled={isUpdating}>Adjust</button>
          </div>

          {/* Add Miner */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input style={styles.input} placeholder="Miner Amount (USD)" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} />
            <input style={styles.input} placeholder="Tx Hash (optional)" value={addTx} onChange={(e) => setAddTx(e.target.value)} />
            <button className="lxr-buy-btn" onClick={addMiner} disabled={isUpdating}>Add Miner</button>
          </div>

          {/* List Miners */}
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead><tr><th>ID</th><th>Amount</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {history.length === 0 ? (<tr><td colSpan={4}>No miners</td></tr>) : history.map(h => (
                  <tr key={h.id}><td>{h.id}</td><td>${h.amount_usd}</td><td>{h.active ? 'Active' : 'Expired'}</td>
                  <td style={{ textAlign: 'right' }}><button style={styles.buttonDanger} onClick={() => removeMiner(h.id)} disabled={isUpdating}>Remove</button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Surface>
  )
}

const QuickExpiry: React.FC<{ onSet: (mins: number) => void }> = ({ onSet }) => {
  const [mins, setMins] = useState<string>('')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        style={{ height: 34, borderRadius: 8, border: '2px solid rgba(20,184,166,0.3)', padding: '0 8px', background: 'rgba(255,255,255,0.05)', color: colors.text, width: 90 }}
        placeholder="mins" value={mins} onChange={(e) => setMins(e.target.value)}
      />
      <button
        style={{ height: 34, borderRadius: 8, border: 'none', cursor: 'pointer', padding: '0 10px', fontWeight: 800, background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`, color: '#0b1b3b' }}
        onClick={() => { const v = Number(mins || '0'); if (!Number.isFinite(v) || v <= 0) { showErrorToast('Enter minutes > 0'); return } onSet(v); setMins('') }}
      >
        Set expiry
      </button>
    </div>
  )
}

export default AdminDashboard
