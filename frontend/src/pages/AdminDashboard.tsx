// frontend/src/pages/AdminDashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  getTotalUsersFromChain,
  getTopReferrersFromChain,
} from '../utils/contract'
import { showSuccessToast, showErrorToast } from '../utils/notification'
import { ethers, BrowserProvider } from 'ethers'

// Icons
const IconHome: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5v8.5a2 2 0 0 1-2 2h-5v-6H10v6H5a2 2 0 0 1-2-2v-8.5z" fill="currentColor"/></svg>
)
const IconFinance: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M3 17h18v2H3v-2zm2-3h3v3H5v-3zm5-4h3v7h-3V10zm5-5h3v12h-3V5z" fill="currentColor"/>
  </svg>
)
const IconUser: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0-5-5 5.006 5.006 0 0 0 5 5zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14z" fill="currentColor"/></svg>
)
const IconInfo: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 4a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 12 6zm2 12h-4v-2h1v-4h-1V10h3v6h1z" fill="currentColor"/></svg>
)

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  danger: '#ef4444',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
  accentSoft: '#e0f5ed',
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', width: '100%' },
  container: { maxWidth: 880, margin: '0 auto', padding: '16px 12px 96px' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap', color: colors.text },
  brand: { fontWeight: 900, fontSize: 18, letterSpacing: 1 },

  userMenuWrap: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8 },
  userIdText: { fontWeight: 800, fontSize: 13, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userMenuBtn: { width: 34, height: 34, borderRadius: '50%', border: `1px solid ${colors.grayLine}`, background: 'rgba(255,255,255,0.06)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: colors.text },
  dropdown: { position: 'absolute', right: 0, top: 40, background: 'rgba(15,31,63,0.98)', border: `1px solid ${colors.grayLine}`, borderRadius: 10, boxShadow: '0 10px 24px rgba(0,0,0,0.35)', padding: 6, minWidth: 140, zIndex: 100, backdropFilter: 'blur(8px)', color: colors.text },
  dropdownItem: { width: '100%', textAlign: 'left' as const, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 800, color: colors.text },

  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'stretch' },
  row: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, width: '100%' },
  input: { height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)', padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%' },
  textarea: { minHeight: 120, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)', padding: 10, background: 'rgba(255,255,255,0.05)', color: colors.text, fontFamily: 'monospace', fontSize: 13 },
  small: { fontSize: 12, color: colors.textMuted },
  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` },

  button: { height: 44, borderRadius: 10, background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`, color: '#0b1b3b', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', boxShadow: '0 4px 15px rgba(20,184,166,0.3)' },
  buttonGhost: { height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`, fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px' },
  buttonDanger: { height: 44, borderRadius: 10, background: '#b91c1c', color: '#fff', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px' },

  bottomNavWrap: { position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 880, padding: '0 12px', zIndex: 200 },
  bottomNav: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  navBtn: { height: 48, borderRadius: 12, border: `1px solid ${colors.grayLine}`, background: 'rgba(255,255,255,0.06)', fontWeight: 800, cursor: 'pointer', color: colors.text, display: 'grid', placeItems: 'center' },
  navBtnActive: { background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`, color: '#0b1b3b', borderColor: colors.accent },
}

// surface wrapper
const Surface: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div className="lxr-surface" style={style}>
    <div className="lxr-surface-lines" />
    <div className="lxr-surface-mesh" />
    <div className="lxr-surface-circuit" />
    <div className="lxr-surface-holo" />
    <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
  </div>
)

type RefTop = { address: string; userId: string; count: number }

const AdminDashboard: React.FC = () => {
  const { account, disconnect } = useWallet()

  const [activeTab, setActiveTab] = useState<'home' | 'finance'>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  }, [])

  // Admin guard
  const { data: role, isLoading: isRoleLoading } = useQuery<{ isAdmin: boolean; isOwner: boolean }>({
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

  // Finance metrics
  const { data: finance, refetch: refetchFinance } = useQuery({
    queryKey: ['adminFinance', account],
    enabled: !!account && !!role?.isAdmin,
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

  // Analytics
  const { data: totalUsers = 0 } = useQuery<number>({
    queryKey: ['totalUsers'],
    enabled: !!role?.isAdmin,
    queryFn: () => getTotalUsersFromChain(),
    refetchInterval: 60000,
  })

  const { data: topRef = [] } = useQuery<RefTop[]>({
    queryKey: ['topReferrers'],
    enabled: !!role?.isAdmin,
    queryFn: () => getTopReferrersFromChain(10),
    refetchInterval: 120000,
  })

  // ------------- Notice posting -------------
  type NoticeType = 'image' | 'script'
  const [noticeType, setNoticeType] = useState<NoticeType>('image')
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [scriptContent, setScriptContent] = useState('')
  const [isPosting, setIsPosting] = useState(false)

  const readFileAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result || ''))
      fr.onerror = reject
      fr.readAsDataURL(file)
    })

  const onPickImage = async (file?: File | null) => {
    if (!file) return
    try {
      const dataUrl = await readFileAsDataURL(file)
      setImageUrl(dataUrl)
    } catch (e) {
      showErrorToast(e, 'Failed to load image')
    }
  }

  const wrapScriptIfNeeded = (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return ''
    if (trimmed.toLowerCase().includes('<script')) return trimmed
    return `<script>\n${trimmed}\n</script>`
  }

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

  const postNotice = async () => {
    if (!account) return
    if (noticeType === 'image' && !imageUrl) { showErrorToast('Please provide an image (upload or URL)'); return }
    if (noticeType === 'script' && !scriptContent.trim()) { showErrorToast('Please add script content'); return }
    setIsPosting(true)
    try {
      const { timestamp, signature } = await signAdminAction('create_notice', account)
      const { createNotice } = await import('../services/api')
      await createNotice({
        address: account,
        timestamp,
        signature,
        title: title.trim(),
        is_active: true,
        priority: 0,
        kind: noticeType,
        image_url: noticeType === 'image' ? imageUrl : '',
        link_url: noticeType === 'image' ? (linkUrl || '') : '',
        content_html: noticeType === 'script' ? wrapScriptIfNeeded(scriptContent) : '',
      })
      showSuccessToast('Notice posted')
      setTitle(''); setImageUrl(''); setLinkUrl(''); setScriptContent('')
    } catch (e) {
      showErrorToast(e, 'Failed to post notice')
    } finally {
      setIsPosting(false)
    }
  }

  // ------------- Finance handlers -------------
  const [liqAmount, setLiqAmount] = useState<string>('')

  const handleWithdrawCommission = async () => {
    try {
      const tx = await withdrawCommission()
      // @ts-ignore
      if (tx?.wait) await tx.wait()
      showSuccessToast('Commission withdrawn')
      refetchFinance()
    } catch (e) { showErrorToast(e, 'Commission withdrawal failed') }
  }

  const handleEmergencyWithdrawAll = async () => {
    if (!role?.isOwner) { showErrorToast('Only owner can use emergency withdraw'); return }
    if (!window.confirm('Withdraw all contract funds to owner wallet?')) return
    try {
      const tx = await emergencyWithdrawAll()
      // @ts-ignore
      if (tx?.wait) await tx.wait()
      showSuccessToast('Emergency withdraw completed')
      refetchFinance()
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
      refetchFinance()
    } catch (e) { showErrorToast(e, 'Liquidity withdraw failed') }
  }

  if (!account) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <Surface>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Connect your wallet</div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>Admin dashboard requires a connected admin wallet.</div>
          </Surface>
        </div>
      </div>
    )
  }

  if (isRoleLoading) {
    return null
  }

  if (!role?.isAdmin) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <Surface>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Not authorized</div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>This wallet is not an admin. Please switch to the owner/admin wallet.</div>
          </Surface>
        </div>
      </div>
    )
  }

  const renderHome = () => (
    <div style={styles.grid}>
      {/* Notice Posting */}
      <Surface>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <div style={{ fontWeight: 900 }}>Post Notice</div>
          <div style={{ ...styles.small, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconInfo /> Image opens link on click • Script injects into notice area
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 8 }}>
          <button style={{ ...styles.buttonGhost, ...(noticeType === 'image' ? { borderColor: colors.accent } : {}) }} onClick={() => setNoticeType('image')}>Image</button>
          <button style={{ ...styles.buttonGhost, ...(noticeType === 'script' ? { borderColor: colors.accent } : {}) }} onClick={() => setNoticeType('script')}>Script</button>
        </div>

        <div style={styles.row}>
          <div>
            <div style={{ ...styles.small, marginBottom: 4 }}>Title (optional)</div>
            <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter title" />
          </div>
        </div>

        {noticeType === 'image' ? (
          <>
            <div style={styles.row}>
              <div>
                <div style={{ ...styles.small, marginBottom: 4 }}>Image upload</div>
                <input type="file" accept="image/*" onChange={(e) => onPickImage(e.target.files?.[0] || null)} />
              </div>
              <div>
                <div style={{ ...styles.small, marginBottom: 4 }}>Or Image URL</div>
                <input style={styles.input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div style={styles.row}>
              <div>
                <div style={{ ...styles.small, marginBottom: 4 }}>Link URL (optional)</div>
                <input style={styles.input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </>
        ) : (
          <div style={styles.row}>
            <div>
              <div style={{ ...styles.small, marginBottom: 4 }}>Script content</div>
              <textarea style={styles.textarea} value={scriptContent} onChange={(e) => setScriptContent(e.target.value)} placeholder={`console.log('Hello from admin script');`} />
            </div>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <button className="lxr-buy-btn" onClick={postNotice} disabled={isPosting}>
            {isPosting ? 'POSTING...' : 'Post Notice'}
          </button>
        </div>
      </Surface>

      {/* Analysis */}
      <Surface>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Analysis</div>
        <div style={{ marginBottom: 10, ...styles.small }}>
          Total users: <strong style={{ color: colors.accent }}>{totalUsers}</strong>
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
                <tr key={r.address}>
                  <td style={styles.td}>{idx + 1}</td>
                  <td style={styles.td}>{r.userId || '-'}</td>
                  <td style={styles.td}><span title={r.address}>{r.address.slice(0, 6)}…{r.address.slice(-4)}</span></td>
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
    </div>
  )

  const renderFinance = () => (
    <div style={styles.grid}>
      <Surface>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Finance</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={styles.small}>Total Commission: <strong style={{ color: colors.accent }}>${Number(finance?.commission || 0).toFixed(2)}</strong></div>
          <div><button className="lxr-buy-btn" onClick={handleWithdrawCommission}>Withdraw Commission</button></div>
          <div style={styles.small}>Contract Balance: <strong style={{ color: colors.accent }}>${Number(finance?.balance || 0).toFixed(2)}</strong></div>
          {role?.isOwner && <div><button style={styles.buttonDanger} onClick={handleEmergencyWithdrawAll}>Emergency Withdraw All</button></div>}
          <div style={styles.small}>Total Liquidity (miners): <strong style={{ color: colors.accent }}>${Number(finance?.totalCollected || 0).toFixed(2)}</strong></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <input style={styles.input} placeholder="Enter amount in USDT" value={liqAmount} onChange={(e) => setLiqAmount(e.target.value)} />
            <button className="lxr-buy-btn" onClick={handleWithdrawLiquidity}>Withdraw Liquidity</button>
          </div>
        </div>
      </Surface>
    </div>
  )

  const displayUserId = useMemo(() => (account || '').slice(0, 6).toUpperCase(), [account])

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div className="lxr-lexori-logo" style={styles.brand as any}>Admin Console</div>
          <div style={styles.userMenuWrap} ref={menuRef}>
            <span style={styles.userIdText} title={account || ''}>{displayUserId}</span>
            <button style={styles.userMenuBtn} onClick={() => setMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="User menu">
              <IconUser size={18} />
            </button>
            {menuOpen && (
              <div style={styles.dropdown} role="menu">
                <button className="dropdown-item" style={styles.dropdownItem} onClick={() => { setMenuOpen(false); /* optional: disconnect() */ }}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'home' ? renderHome() : renderFinance()}

        {/* Bottom nav */}
        <div style={styles.bottomNavWrap}>
          <div className="lxr-surface" style={{ padding: 8, borderRadius: 14 }}>
            <div className="lxr-surface-lines" />
            <div className="lxr-surface-mesh" />
            <div className="lxr-surface-circuit" />
            <div className="lxr-surface-holo" />
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={styles.bottomNav}>
                <button style={{ ...styles.navBtn, ...(activeTab === 'home' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('home')} title="Home" aria-label="Home">
                  <IconHome size={20} />
                </button>
                <button style={{ ...styles.navBtn, ...(activeTab === 'finance' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('finance')} title="Finance" aria-label="Finance">
                  <IconFinance size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* End bottom nav */}
      </div>
    </div>
  )
}

export default AdminDashboard
