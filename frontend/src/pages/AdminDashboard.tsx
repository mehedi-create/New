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
  getAdminTopReferrers,
  type AdminOverviewResponse,
  type AdminTopReferrer,
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

// Icons
const IconHome: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="true">
    <path d="M3 10.5L12 3l9 7.5v8.5a2 2 0 0 1-2 2h-5v-6H10v6H5a2 2 0 0 1-2-2v-8.5z" fill="currentColor"/>
  </svg>
)
const IconFinance: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="true">
    <path d="M3 17h18v2H3v-2zm2-3h3v3H5v-3zm5-4h3v7h-3V10zm5-5h3v12h-3V5z" fill="currentColor"/>
  </svg>
)
const IconUser: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="true">
    <path d="M12 12a5 5 0 1 0-5-5 5.006 5.006 0 0 0 5 5zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14z" fill="currentColor"/>
  </svg>
)

const AdminDashboard: React.FC = () => {
  const { account, disconnect } = useWallet()
  const navigate = useNavigate()

  // UI state
  const [activeTab, setActiveTab] = useState<'home' | 'finance'>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close dropdown on outside click / ESC
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  }, [])

  // Role check (on-chain)
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

  // Redirect if not allowed
  useEffect(() => {
    if (!account) { navigate('/login', { replace: true }); return }
    if (role && !role.isAdmin && !role.isOwner) {
      navigate('/dashboard', { replace: true })
    }
  }, [account, role, navigate])

  const allow = !!account && !!role && (role.isAdmin || role.isOwner)

  // Finance metrics
  const { data: finance } = useQuery({
    queryKey: ['adminFinance', account],
    enabled: allow,
    refetchInterval: 20000,
    queryFn: async () => {
      const [commission, balance, totalCollected] = await Promise.all([
        getAdminCommission(account!),
        getContractBalance(),
        getTotalCollected(),
      ])
      return { commission, balance, totalCollected }
    },
  })

  // Notices list (admin manage)
  const { data: adminList = [], refetch: refetchAdminList, isFetching: isListFetching } = useQuery<AdminNotice[]>({
    queryKey: ['adminNotices'],
    enabled: allow,
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await getAdminNotices(150)
      return res.data.notices || []
    },
  })

  // Analysis (restored)
  const { data: overview } = useQuery<AdminOverviewResponse>({
    queryKey: ['adminOverview'],
    enabled: allow,
    refetchInterval: 60000,
    queryFn: async () => (await getAdminOverview()).data,
  })
  const totalUsers = overview?.total_users ?? 0
  const totalCoins = overview?.total_coins ?? 0

  const { data: topRef = [] } = useQuery<AdminTopReferrer[]>({
    queryKey: ['adminTopReferrers'],
    enabled: allow,
    refetchInterval: 120000,
    queryFn: async () => {
      const res = await getAdminTopReferrers(10)
      return res.data.top || []
    },
  })

  // Sign helper
  const signAdminAction = async (purpose: string, address: string) => {
    const provider = new BrowserProvider((window as any).ethereum)
    const signer = await provider.getSigner()
    const ts = Math.floor(Date.now() / 1000)
    const message = `Admin action authorization
Purpose: ${purpose}
Address: ${ethers.getAddress(address)}
Timestamp: ${ts}`
    const signature = await signer.signMessage(message)
    return { timestamp: ts, signature }
  }

  // Post Notice form state
  type Tab = 'image' | 'script'
  const [postTab, setPostTab] = useState<Tab>('image')
  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [scriptContent, setScriptContent] = useState('')
  const [expireMinutes, setExpireMinutes] = useState<string>('') // blank = permanent
  const [isPosting, setIsPosting] = useState(false)

  const minutesToSeconds = (mStr: string) => {
    const m = Number(mStr || '0')
    return Number.isFinite(m) && m > 0 ? Math.round(m * 60) : undefined
  }

  const onPostNotice = async () => {
    if (!account) return
    try {
      setIsPosting(true)
      const { timestamp, signature } = await signAdminAction('create_notice', account)
      const expires_in_sec = minutesToSeconds(expireMinutes)

      if (postTab === 'image') {
        if (!imageUrl.trim()) { showErrorToast('Please provide image URL'); return }
        await createNotice({
          address: account,
          timestamp, signature,
          kind: 'image',
          image_url: imageUrl.trim(),
          link_url: (linkUrl || '').trim(),
          is_active: true,
          priority: 0,
          ...(expires_in_sec ? { expires_in_sec } : {}),
        })
      } else {
        if (!scriptContent.trim()) { showErrorToast('Please provide script content'); return }
        await createNotice({
          address: account,
          timestamp, signature,
          kind: 'script',
          content_html: scriptContent,
          is_active: true,
          priority: 0,
          ...(expires_in_sec ? { expires_in_sec } : {}),
        })
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

  // Manage: delete notice
  const deleteOne = async (id: number) => {
    if (!account) return
    if (!window.confirm('Delete this notice?')) return
    try {
      const { timestamp, signature } = await signAdminAction('delete_notice', account)
      await deleteNotice(id, { address: account, timestamp, signature })
      showSuccessToast('Deleted')
      refetchAdminList()
    } catch (e) {
      showErrorToast(e, 'Failed to delete')
    }
  }

  // Manage: quick expiry in minutes
  const setExpiryMinutes = async (id: number, minutes: number) => {
    if (!account) return
    if (!(minutes > 0)) { showErrorToast('Enter minutes > 0'); return }
    try {
      const { timestamp, signature } = await signAdminAction('update_notice', account)
      await updateNotice(id, {
        address: account, timestamp, signature,
        expires_in_sec: Math.round(minutes * 60),
      })
      showSuccessToast('Expiry set')
      refetchAdminList()
    } catch (e) {
      showErrorToast(e, 'Failed to set expiry')
    }
  }

  // Finance handlers
  const [liqAmount, setLiqAmount] = useState<string>('')

  const handleWithdrawCommission = async () => {
    try {
      const tx = await withdrawCommission()
      // @ts-ignore
      if (tx?.wait) await tx.wait()
      showSuccessToast('Commission withdrawn')
    } catch (e) { showErrorToast(e, 'Commission withdrawal failed') }
  }

  const handleEmergencyWithdrawAll = async () => {
    if (!(role?.isOwner || false)) {
      showErrorToast('Only owner can use emergency withdraw')
      return
    }
    if (!window.confirm('Withdraw all contract funds to owner wallet?')) return
    try {
      const tx = await emergencyWithdrawAll()
      // @ts-ignore
      if (tx?.wait) await tx.wait()
      showSuccessToast('Emergency withdraw completed')
    } catch (e) { showErrorToast(e, 'Emergency withdraw failed') }
  }

  const handleWithdrawLiquidity = async () => {
    const amt = Number(liqAmount || '0')
    if (amt <= 0) { showErrorToast('Enter a valid amount'); return }
    try {
      const tx = await withdrawLiquidity(liqAmount)
      // @ts-ignore
      if (tx?.wait) await tx.wait()
      showSuccessToast('Liquidity withdrawn')
      setLiqAmount('')
    } catch (e) { showErrorToast(e, 'Liquidity withdraw failed') }
  }

  // UI helpers
  const displayUserId = useMemo(() => (account || '').slice(0, 6).toUpperCase(), [account])

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <div className="lxr-lexori-logo" style={styles.brand as any}>Admin Console</div>
          <div style={styles.userMenuWrap} ref={menuRef}>
            <span style={styles.userIdText} title={account || ''}>{displayUserId}</span>
            <button
              style={styles.userMenuBtn}
              onClick={() => setMenuOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="User menu"
            >
              <IconUser size={18} />
            </button>
            {menuOpen && (
              <div style={styles.dropdown} role="menu">
                <button
                  className="dropdown-item"
                  style={styles.dropdownItem}
                  onClick={() => { setMenuOpen(false); disconnect() }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs content (no top nav; only bottom nav) */}
        {activeTab === 'home' ? (
          <div style={styles.grid}>
            {/* Post Notice */}
            <Surface title="Post Notice" sub="Image or Script • optional expiry (minutes)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 8 }}>
                <button
                  style={{ ...styles.buttonGhost, ...(postTab === 'image' ? { borderColor: colors.accent } : {}) }}
                  onClick={() => setPostTab('image')}
                >
                  Image
                </button>
                <button
                  style={{ ...styles.buttonGhost, ...(postTab === 'script' ? { borderColor: colors.accent } : {}) }}
                  onClick={() => setPostTab('script')}
                >
                  Script
                </button>
              </div>

              {postTab === 'image' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  <div>
                    <div style={{ ...styles.small, marginBottom: 4 }}>Image URL</div>
                    <input style={styles.input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <div>
                    <div style={{ ...styles.small, marginBottom: 4 }}>Link URL (open on click)</div>
                    <input style={styles.input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <div>
                    <div style={{ ...styles.small, marginBottom: 4 }}>Expires in (minutes) — leave blank to keep</div>
                    <input style={styles.input} value={expireMinutes} onChange={(e) => setExpireMinutes(e.target.value)} placeholder="e.g., 60" />
                  </div>
                  <div>
                    <button className="lxr-buy-btn" onClick={onPostNotice} disabled={isPosting}>
                      {isPosting ? 'POSTING...' : 'Post Image Notice'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  <div>
                    <div style={{ ...styles.small, marginBottom: 4 }}>Script content</div>
                    <textarea
                      style={styles.textarea}
                      value={scriptContent}
                      onChange={(e) => setScriptContent(e.target.value)}
                      placeholder={`console.log('Hello');`}
                    />
                  </div>
                  <div>
                    <div style={{ ...styles.small, marginBottom: 4 }}>Expires in (minutes) — leave blank to keep</div>
                    <input style={styles.input} value={expireMinutes} onChange={(e) => setExpireMinutes(e.target.value)} placeholder="e.g., 120" />
                  </div>
                  <div>
                    <button className="lxr-buy-btn" onClick={onPostNotice} disabled={isPosting}>
                      {isPosting ? 'POSTING...' : 'Post Script Notice'}
                    </button>
                  </div>
                </div>
              )}
            </Surface>

            {/* Analysis (restored) */}
            <Surface title="Analysis" sub="Users • Total coins • Top referrers">
              <div style={{ ...styles.small, marginBottom: 10 }}>
                Total users: <strong style={{ color: colors.accent }}>{totalUsers}</strong>
                {' '}• Total coins: <strong style={{ color: colors.accent }}>{Number(totalCoins || 0).toFixed(0)}</strong>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>User ID</th>
                      <th style={styles.th}>Address</th>
                      <th style={{ ...styles.th, textAlign: 'right' as const }}>Referrals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(topRef || []).map((r, idx) => (
                      <tr key={`${r.address || r.userId}-${idx}`}>
                        <td style={styles.td}>{idx + 1}</td>
                        <td style={styles.td}>{r.userId || '-'}</td>
                        <td style={styles.td}>
                          {r.address ? (
                            <span title={r.address}>{r.address.slice(0, 6)}…{r.address.slice(-4)}</span>
                          ) : (
                            <span style={{ color: colors.textMuted }}>N/A</span>
                          )}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{r.count}</td>
                      </tr>
                    ))}
                    {(!topRef || topRef.length === 0) && (
                      <tr>
                        <td colSpan={4} style={{ ...styles.td, color: colors.textMuted }}>No data</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Surface>

            {/* Manage Notices */}
            <Surface title="Manage Notices" sub={isListFetching ? 'Refreshing…' : `Total: ${adminList.length}`}>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ID</th>
                      <th style={styles.th}>Kind</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Preview</th>
                      <th style={styles.th}>Expires</th>
                      <th style={{ ...styles.th, textAlign: 'right' as const }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(adminList || []).map((n) => {
                      const isExpired = !!n.expires_at && new Date(n.expires_at).getTime() <= Date.now()
                      const statusText = isExpired ? 'Expired' : (n.is_active ? 'Active' : 'Inactive')
                      const expires = n.expires_at ? new Date(n.expires_at).toLocaleString() : '—'
                      const preview = n.kind === 'image' ? (n.image_url || '').slice(0, 32) : (n.content_html || '').slice(0, 32)
                      return (
                        <tr key={n.id}>
                          <td style={styles.td}>{n.id}</td>
                          <td style={styles.td}>{n.kind}</td>
                          <td style={styles.td}>
                            <span style={{ color: isExpired ? colors.textMuted : colors.accent, fontWeight: 800 }}>{statusText}</span>
                          </td>
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
                    {(!adminList || adminList.length === 0) && (
                      <tr>
                        <td colSpan={6} style={{ ...styles.td, color: colors.textMuted }}>No notices</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Surface>
          </div>
        ) : (
          <div style={styles.grid}>
            {/* Finance cards laid out separately */}
            <Surface title="Total Commission">
              <div style={{ ...styles.small, marginBottom: 8 }}>
                <strong style={{ color: colors.accent }}>${Number(finance?.commission || 0).toFixed(2)}</strong>
              </div>
              <button className="lxr-buy-btn" onClick={handleWithdrawCommission}>Withdraw Commission</button>
            </Surface>

            <Surface title="Contract Balance">
              <div style={{ ...styles.small, marginBottom: 8 }}>
                <strong style={{ color: colors.accent }}>${Number(finance?.balance || 0).toFixed(2)}</strong>
              </div>
              <button style={styles.buttonDanger} onClick={handleEmergencyWithdrawAll}>Emergency Withdraw All</button>
            </Surface>

            <Surface title="Total Liquidity (miners)">
              <div style={{ ...styles.small, marginBottom: 8 }}>
                <strong style={{ color: colors.accent }}>${Number(finance?.totalCollected || 0).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <input
                  style={styles.input}
                  placeholder="Enter amount in USDT"
                  value={liqAmount}
                  onChange={(e) => setLiqAmount(e.target.value)}
                />
                <button className="lxr-buy-btn" onClick={handleWithdrawLiquidity}>Withdraw Liquidity</button>
              </div>
            </Surface>
          </div>
        )}
      </div>

      {/* Bottom nav only */}
      <div style={styles.bottomNavWrap}>
        <div className="lxr-surface" style={{ padding: 8, borderRadius: 14 }}>
          <div className="lxr-surface-lines" />
          <div className="lxr-surface-mesh" />
          <div className="lxr-surface-circuit" />
          <div className="lxr-surface-holo" />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={styles.bottomNav}>
              <button
                style={{ ...styles.navBtn, ...(activeTab === 'home' ? styles.navBtnActive : {}) }}
                onClick={() => setActiveTab('home')}
                title="Home"
                aria-label="Home"
              >
                <IconHome size={20} />
              </button>
              <button
                style={{ ...styles.navBtn, ...(activeTab === 'finance' ? styles.navBtnActive : {}) }}
                onClick={() => setActiveTab('finance')}
                title="Finance"
                aria-label="Finance"
              >
                <IconFinance size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Quick expiry setter
const QuickExpiry: React.FC<{ onSet: (mins: number) => void }> = ({ onSet }) => {
  const [mins, setMins] = useState<string>('')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        style={{ height: 34, borderRadius: 8, border: '2px solid rgba(20,184,166,0.3)', padding: '0 8px', background: 'rgba(255,255,255,0.05)', color: colors.text, width: 90 }}
        placeholder="mins"
        value={mins}
        onChange={(e) => setMins(e.target.value)}
      />
      <button
        style={{ height: 34, borderRadius: 8, border: 'none', cursor: 'pointer', padding: '0 10px', fontWeight: 800, background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`, color: '#0b1b3b' }}
        onClick={() => {
          const v = Number(mins || '0')
          if (!Number.isFinite(v) || v <= 0) { showErrorToast('Enter minutes > 0'); return }
          onSet(v)
          setMins('')
        }}
      >
        Set expiry
      </button>
    </div>
  )
}

export default AdminDashboard
