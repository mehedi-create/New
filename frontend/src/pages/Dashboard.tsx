import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '../context/WalletContext'
import {
  withdrawWithFundCode,
  getUserBalance,
  hasSetFundCode,
  signAuthMessage,
  approveUSDT,
  buyMiner,
  getUserMiningStats,
  getRegistrationFee,
  getLevel1ReferralIdsFromChain,
  isRegistered,
} from '../utils/contract'
import { showSuccessToast, showErrorToast } from '../utils/notification'
import { markLogin, getStats, type StatsResponse, upsertUserFromChain } from '../services/api'
import { isValidAddress } from '../utils/wallet'
import NoticeCarousel from '../components/NoticeCarousel' // NEW

type OnChainData = {
  userBalance: string
  hasFundCode: boolean
  registrationFee: string
}

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
  container: { maxWidth: 680, margin: '0 auto', padding: '16px 12px 96px' },
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 12, flexWrap: 'wrap', color: colors.text,
  },
  brand: { fontWeight: 900, fontSize: 18, letterSpacing: 1 },

  userMenuWrap: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8 },
  userIdText: { fontWeight: 800, fontSize: 13, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userMenuBtn: {
    width: 34, height: 34, borderRadius: '50%', border: `1px solid ${colors.grayLine}`,
    background: 'rgba(255,255,255,0.06)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: colors.text,
  },
  dropdown: {
    position: 'absolute', right: 0, top: 40, background: 'rgba(15,31,63,0.98)',
    border: `1px solid ${colors.grayLine}`, borderRadius: 10, boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
    padding: 6, minWidth: 140, zIndex: 100, backdropFilter: 'blur(8px)', color: colors.text,
  },
  dropdownItem: {
    width: '100%', textAlign: 'left' as const, padding: '8px 10px',
    borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 800, color: colors.text,
  },

  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'stretch' },
  cardShell: { background: 'transparent', border: 'none', padding: 0 },
  cardTitle: { margin: '0 0 6px 0', fontSize: 16, fontWeight: 900 },
  row: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, width: '100%' },
  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },
  copyWrap: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, alignItems: 'center' },
  small: { fontSize: 12, color: colors.textMuted },
  balance: { fontSize: 26, fontWeight: 900, margin: '4px 0 6px' },

  button: {
    height: 44, borderRadius: 10,
    background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`,
    color: '#0b1b3b', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', width: '100%',
    boxShadow: '0 4px 15px rgba(20,184,166,0.3)',
  },
  buttonGhost: {
    height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`,
    fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', width: '100%',
  },

  iconBtnGhost: {
    height: 32, width: 32, borderRadius: 8,
    background: 'rgba(255,255,255,0.06)', color: colors.text,
    border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center', cursor: 'pointer',
  },

  bottomNavWrap: { position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 680, padding: '0 12px', zIndex: 200 },
  bottomNav: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  navBtn: {
    height: 48, borderRadius: 12, border: `1px solid ${colors.grayLine}`,
    background: 'rgba(255,255,255,0.06)', fontWeight: 800, cursor: 'pointer', color: colors.text, display: 'grid', placeItems: 'center',
  },
  navBtnActive: { background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`, color: '#0b1b3b', borderColor: colors.accent },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    padding: 12,
  },
}

const IconHome: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5v8.5a2 2 0 0 1-2 2h-5v-6H10v6H5a2 2 0 0 1-2-2v-8.5z" fill="currentColor"/></svg>
)
const IconSurpriseCoin: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M17.4 4.8l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5.5-1.4z" fill="currentColor"/>
  </svg>
)
const IconUser: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0-5-5 5.006 5.006 0 0 0 5 5zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14z" fill="currentColor"/></svg>
)
const IconInfo: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 4a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 12 6zm2 12h-4v-2h1v-4h-1V10h3v6h1z" fill="currentColor"/></svg>
)

const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="lxr-surface">
    <div className="lxr-surface-lines" />
    <div className="lxr-surface-mesh" />
    <div className="lxr-surface-circuit" />
    <div className="lxr-surface-holo" />
    <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
  </div>
)

const setCookie = (name: string, value: string, days = 365) => {
  const maxAge = days * 24 * 60 * 60
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}
const getCookie = (name: string): string | null => {
  const key = `${encodeURIComponent(name)}=`
  const parts = document.cookie.split('; ')
  for (const p of parts) if (p.startsWith(key)) return decodeURIComponent(p.substring(key.length))
  return null
}

const Dashboard: React.FC = () => {
  const { account, userId, disconnect } = useWallet()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTabState] = useState<'home' | 'surprise'>(() => (getCookie('activeTab') === 'surprise' ? 'surprise' : 'home'))
  const setActiveTab = (t: 'home' | 'surprise') => { setActiveTabState(t); setCookie('activeTab', t, 365) }
  const [isProcessing, setIsProcessing] = useState(false)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  }, [])

  // ---------- On-chain data ----------
  const { data: onChainData, isLoading: isOnChainLoading } = useQuery<OnChainData | null>({
    queryKey: ['onChainData', account],
    enabled: isValidAddress(account),
    refetchInterval: 30000,
    retry: 1,
    queryFn: async () => {
      if (!isValidAddress(account)) return null
      const [balance, hasCode, fee] = await Promise.all([
        getUserBalance(account!), hasSetFundCode(account!), getRegistrationFee(),
      ])
      return { userBalance: balance, hasFundCode: hasCode, registrationFee: fee }
    },
  })

  // ---------- Referrals ----------
  const { data: referralList = [], isLoading: isRefsLoading } = useQuery<string[]>({
    queryKey: ['referralsL1', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return []
      return getLevel1ReferralIdsFromChain(account!)
    },
  })

  // ---------- Mining stats ----------
  useQuery<{ count: number; totalDeposited: string }>({
    queryKey: ['miningStats', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return { count: 0, totalDeposited: '0.00' }
      return getUserMiningStats(account!)
    },
  })

  // ---------- Off-chain stats (lite) ----------
  const { data: stats, isLoading: _isStatsLoading, refetch: refetchStatsLite } = useQuery<StatsResponse | null>({
    queryKey: ['stats-lite', account],
    enabled: isValidAddress(account),
    retry: false, refetchOnWindowFocus: false, refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return null
      try { const res = await getStats(account!); return res.data } catch (err: any) {
        const status = err?.response?.status || err?.status; if (status === 404) return null; throw err
      }
    },
  })

  // ---------- Auto-sync off-chain profile ----------
  const ensureRef = useRef<{ inFlight: boolean; last: number }>({ inFlight: false, last: 0 })
  useEffect(() => {
    if (!isValidAddress(account)) return
    const run = async () => {
      const now = Date.now()
      if (ensureRef.current.inFlight || now - ensureRef.current.last < 10000) return
      ensureRef.current.inFlight = true
      try {
        const onChain = await isRegistered(account!)
        if (!onChain) return
        let exists = false
        try {
          const res = await getStats(account!)
          exists = !!res?.data?.userId
        } catch (e: any) {
          const status = e?.response?.status || e?.status
          if (status !== 404) return
        }
        if (!exists) {
          const { timestamp, signature } = await signAuthMessage(account!)
          await upsertUserFromChain(account!, timestamp, signature)
          await refetchStatsLite()
        }
      } catch {
        // silent
      } finally {
        ensureRef.current.inFlight = false
        ensureRef.current.last = Date.now()
      }
    }
    run()
  }, [account, refetchStatsLite])

  const referralCode = useMemo(() => (userId || '').toUpperCase(), [userId])
  const displayUserId = useMemo(() => (userId || stats?.userId || 'USER').toUpperCase(), [userId, stats?.userId])
  const referralLink = useMemo(() => `${window.location.origin}/register?ref=${referralCode}`, [referralCode])

  const safeMoney = (val?: string) => { const n = parseFloat(val || '0'); return isNaN(n) ? '0.00' : n.toFixed(2) }
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); showSuccessToast('Copied to clipboard') }
  const coinBalanceText = Number(stats?.coin_balance ?? 0).toFixed(2)

  // ---------- Modals ----------
  const [showCoinInfo, setShowCoinInfo] = useState(false)
  const [showFundModal, setShowFundModal] = useState(false)
  const [fundCode, setFundCode] = useState('')
  const [fundErr, setFundErr] = useState<string>('')

  const openFundModal = () => { setFundErr(''); setFundCode(''); setShowFundModal(true) }

  const confirmWithdraw = async () => {
    if (!fundCode) { setFundErr('Please enter your Fund Code'); return }
    setFundErr('')
    setIsProcessing(true)
    try {
      const tx = await withdrawWithFundCode(fundCode)
      if ((tx as any)?.wait) await (tx as any).wait()
      setShowFundModal(false)
      setFundCode('')
      showSuccessToast('Payout successful!')
    } catch (e) {
      setFundErr(typeof (e as any)?.message === 'string' ? (e as any).message : 'Payout failed')
      showErrorToast(e, 'Payout failed')
    } finally {
      setIsProcessing(false)
    }
  }

  // ---------- Actions ----------
  const handleUserPayout = () => {
    if (!onChainData?.hasFundCode) { showErrorToast('Fund code not set. Please register with a fund code.'); return }
    openFundModal()
  }

  const handleMarkTodayLogin = async () => {
    if (!isValidAddress(account)) return
    setIsProcessing(true)
    try {
      const { timestamp, signature } = await signAuthMessage(account!)
      try {
        await markLogin(account!, timestamp, signature)
      } catch (err: any) {
        const status = err?.response?.status || err?.status
        if (status === 404) {
          await upsertUserFromChain(account!, timestamp, signature)
          await markLogin(account!, timestamp, signature)
        } else {
          throw err
        }
      }
      showSuccessToast('Login counted for today')
      await refetchStatsLite()
    } catch (e) {
      showErrorToast(e, 'Unable to mark login')
    } finally {
      setIsProcessing(false)
    }
  }

  const [miningAmount, setMiningAmount] = useState<string>(() => getCookie('miningAmount') || '5.00')
  useEffect(() => { setCookie('miningAmount', miningAmount || '', 30) }, [miningAmount])
  const amountNum = Number(miningAmount || '0')
  const isInvalidAmount = miningAmount !== '' && (isNaN(amountNum) || amountNum < 5)

  const handleBuyMiner = async () => {
    if (!isValidAddress(account)) return
    if (isNaN(amountNum) || amountNum < 5) { showErrorToast('Minimum 5 USDT required.'); return }
    setIsProcessing(true)
    try {
      const tx1 = await approveUSDT(miningAmount); if ((tx1 as any)?.wait) await (tx1 as any).wait()
      const tx2 = await buyMiner(miningAmount); if ((tx2 as any)?.wait) await (tx2 as any).wait()
      showSuccessToast(`Purchased $${Number(miningAmount).toFixed(2)} mining power`)
      queryClient.invalidateQueries({ queryKey: ['miningStats', account] })
    } catch (e) { showErrorToast(e, 'Failed to buy miner') } finally { setIsProcessing(false) }
  }

  // ---------- Renderers ----------
  const renderHome = () => (
    <div style={styles.grid}>
      {/* Balance card */}
      <div style={styles.cardShell}>
        <Surface>
          <h3 style={styles.cardTitle}>Available Balance</h3>
          {isOnChainLoading ? (
            <div style={{ height: 26, background: 'rgba(255,255,255,0.08)', borderRadius: 8 }} />
          ) : (
            <div style={styles.balance}>${safeMoney(onChainData?.userBalance)}</div>
          )}
          <div style={styles.row}>
            <button style={styles.button} disabled={isProcessing || isOnChainLoading} onClick={handleUserPayout}>
              Payout
            </button>
          </div>
          {!isOnChainLoading && !onChainData?.hasFundCode && (
            <div style={{ ...styles.small, color: colors.danger, marginTop: 8 }}>
              Fund code not set. You must register with a fund code to withdraw.
            </div>
          )}
        </Surface>
      </div>

      {/* Notice slider (between Balance and Share & Earn) */}
      <div style={styles.cardShell}>
        <NoticeCarousel autoIntervalMs={5000} limit={10} />
      </div>

      {/* Share & Earn card */}
      <div style={styles.cardShell}>
        <Surface>
          <h3 style={styles.cardTitle}>Share & Earn</h3>
          <div style={{ marginBottom: 8 }}>
            <div style={{ ...styles.small, marginBottom: 4 }}>Referral Code</div>
            <div style={styles.copyWrap}>
              <input style={styles.input} readOnly value={referralCode || ''} />
              <button style={styles.button} onClick={() => copyToClipboard(referralCode)}>Copy</button>
            </div>
          </div>
          <div>
            <div style={{ ...styles.small, marginBottom: 4 }}>Referral Link</div>
            <div style={styles.copyWrap}>
              <input style={styles.input} readOnly value={referralLink} />
              <button style={styles.button} onClick={() => copyToClipboard(referralLink)}>Copy</button>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  )

  const renderCoinInfoModal = () => {
    if (!showCoinInfo) return null
    return (
      <div style={styles.overlay} onClick={() => setShowCoinInfo(false)}>
        <div className="lxr-surface" style={{ maxWidth: 520, width: '100%' }} onClick={(e) => e.stopPropagation()}>
          <div className="lxr-surface-lines" />
          <div className="lxr-surface-mesh" />
          <div className="lxr-surface-circuit" />
          <div className="lxr-surface-holo" />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 900 }}>How to earn coins</div>
              <button style={styles.iconBtnGhost} onClick={() => setShowCoinInfo(false)} aria-label="Close">✕</button>
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>
              Earn coins through daily activity, referrals, and mining:
            </div>
            <div style={{ border: `1px solid ${colors.grayLine}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontWeight: 800 }}>
                <div>Action</div><div style={{ textAlign: 'right' }}>Coins</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` }}>
                <div>Daily login</div><div style={{ textAlign: 'right' }}>+1 coin/day</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}` }}>
                <div>Per referral</div><div style={{ textAlign: 'right' }}>+5 coins</div>
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Mining</div>
                <div style={{ fontSize: 13, color: colors.textMuted }}>
                  Earn coins daily equal to your invested USDT, for 30 days.
                  <br />Example: invest $5 USDT → earn 5 coins/day × 30 days.
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button style={styles.button} onClick={() => setShowCoinInfo(false)}>Got it</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderFundModal = () => {
    if (!showFundModal) return null
    return (
      <div style={styles.overlay} onClick={() => (!isProcessing ? setShowFundModal(false) : null)}>
        <div className="lxr-surface" style={{ maxWidth: 420, width: '100%' }} onClick={(e) => e.stopPropagation()}>
          <div className="lxr-surface-lines" />
          <div className="lxr-surface-mesh" />
          <div className="lxr-surface-circuit" />
          <div className="lxr-surface-holo" />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Enter Fund Code</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>
              Your secret Fund Code is required to withdraw your on‑chain balance.
            </div>
            <input
              type="password" placeholder="••••" value={fundCode}
              onChange={(e) => setFundCode(e.target.value)}
              style={{ ...styles.input, marginBottom: 8 }} disabled={isProcessing}
            />
            {!!fundErr && <div style={{ color: colors.danger, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{fundErr}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="lxr-buy-btn" onClick={confirmWithdraw} disabled={isProcessing}>
                {isProcessing ? 'PROCESSING...' : 'Withdraw'}
              </button>
              <button style={styles.buttonGhost} onClick={() => setShowFundModal(false)} disabled={isProcessing}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderSurprise = () => (
    <div style={styles.grid}>
      <div style={styles.cardShell}>
        <Surface>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={styles.cardTitle}>Total Coin Balance</h3>
            <button style={styles.iconBtnGhost} onClick={() => setShowCoinInfo(true)} title="How to earn coins" aria-label="How to earn coins">
              <IconInfo />
            </button>
          </div>
          <div style={styles.balance}>{coinBalanceText}</div>
          <button style={styles.buttonGhost} disabled>
            Withdraw (Coming Soon)
          </button>
        </Surface>
      </div>

      <div style={styles.cardShell}>
        <div className="lxr-mining-card">
          <div className="lxr-network-lines" />
          <div className="lxr-crypto-mesh" />
          <div className="lxr-circuit" />
          <div className="lxr-holo" />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div className="lxr-lexori-logo" style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>LEXORI</div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: colors.accent }}>MINING CARD</div>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(45deg, #14b8a6, #e8f9f1)', color: '#000', fontWeight: 800 }}>L</div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 13, fontWeight: 600, color: colors.accent }}>
              Earn coins daily equal to your invested USDT, for 30 days.
              <br />Example: invest $5 USDT → 5 coins/day × 30 days.
            </div>

            <div className="lxr-panel">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="lxr-qty" style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: colors.accent }}>
                    Quantity (USD)
                  </label>
                  <input
                    id="lxr-qty" className={`lxr-quantity ${isInvalidAmount ? 'lxr-invalid' : ''}`}
                    type="number" min={5} step="0.01" placeholder="5.00"
                    value={miningAmount} onChange={(e) => setMiningAmount(e.target.value)}
                  />
                </div>
                <button className="lxr-buy-btn" onClick={handleBuyMiner} disabled={isProcessing}>
                  {isProcessing ? 'PROCESSING...' : 'BUY NOW'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.cardShell}>
        <Surface>
          <h3 style={styles.cardTitle}>Your Stats</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <div style={{ background: 'rgba(0,0,0,0.30)', border: `1px solid ${colors.grayLine}`, borderRadius: 12, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: colors.textMuted }}>Total Refer (L1)</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{isRefsLoading ? '...' : referralList.length}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.30)', border: `1px solid ${colors.grayLine}`, borderRadius: 12, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: colors.textMuted }}>Total Login (days)</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{_isStatsLoading ? '...' : (stats?.logins?.total_login_days ?? 0)}</div>
            </div>
          </div>
          <div style={{ ...styles.row, marginTop: 8 }}>
            <button style={styles.button} disabled={isProcessing || !account} onClick={handleMarkTodayLogin}>
              Mark Today’s Login
            </button>
          </div>
        </Surface>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      {renderCoinInfoModal()}
      {renderFundModal()}

      <div style={styles.container}>
        <div style={styles.topBar}>
          <div className="lxr-lexori-logo" style={styles.brand as any}>Web3 Community</div>
          <div style={styles.userMenuWrap} ref={menuRef}>
            <span style={styles.userIdText} title={displayUserId}>{displayUserId}</span>
            <button style={styles.userMenuBtn} onClick={() => setMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="User menu">
              <IconUser size={18} />
            </button>
            {menuOpen && (
              <div style={styles.dropdown} role="menu">
                <button style={styles.dropdownItem} onClick={() => { setMenuOpen(false); disconnect() }} role="menuitem">
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'home' ? renderHome() : renderSurprise()}

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
                <button style={{ ...styles.navBtn, ...(activeTab === 'surprise' ? styles.navBtnActive : {}) }} onClick={() => setActiveTab('surprise')} title="Surprise" aria-label="Surprise">
                  <IconSurpriseCoin size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
