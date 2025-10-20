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
import { markLogin, getStats, type StatsResponse, upsertUserFromChain, recordMiningPurchase } from '../services/api'
import { isValidAddress } from '../utils/wallet'
import NoticeCarousel from '../components/NoticeCarousel'
import { config } from '../config'
import { ethers, JsonRpcProvider, Interface, zeroPadValue, formatUnits } from 'ethers'

type OnChainData = {
  userBalance: string
  hasFundCode: boolean
  registrationFee: string
}

type MinerPurchaseItem = {
  txHash: string
  date: string
  amount: string
  active: boolean
  daysLeft: number
  startTime: number
  endTime: number
}

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  danger: '#ef4444',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
  accentSoft: '#e0f5ed',
  disabledBg: '#6b7280',
  disabledText: '#e5e7eb',
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
    transition: 'background 0.2s ease, opacity 0.2s ease',
  },
  buttonDisabled: {
    background: colors.disabledBg,
    color: colors.disabledText,
    cursor: 'not-allowed',
    boxShadow: 'none',
    opacity: 0.85,
  },
  buttonGhost: {
    height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`,
    fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', width: '100%',
    transition: 'opacity 0.2s ease',
  },
  buttonGhostDisabled: {
    background: 'rgba(255,255,255,0.08)',
    color: colors.disabledText,
    borderColor: colors.grayLine,
    cursor: 'not-allowed',
    opacity: 0.6,
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

  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontWeight: 900, fontSize: 13 },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontSize: 13 },
  statusActive: { color: colors.accent, fontWeight: 900 },
  statusExpired: { color: colors.textMuted, fontWeight: 800 },
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

// Fetch miner purchase history directly from chain (for modal)
const fetchMinerHistoryFromChain = async (address: string): Promise<MinerPurchaseItem[]> => {
  const provider = new JsonRpcProvider(config.readRpcUrl)
  const ABI = ['event MinerPurchased(address indexed user, uint256 amount, uint256 startTime, uint256 endTime)']
  const IFACE = new Interface(ABI)
  const TOPIC = ethers.id('MinerPurchased(address,uint256,uint256,uint256)')
  const user = ethers.getAddress(address)
  const paddedUser = zeroPadValue(user, 32)

  const latest = await provider.getBlockNumber()
  const startConfigured = Number(config.startBlock || 0)
  const maxBlocks = 200_000
  const step = 50_000
  const fromBlock = startConfigured > 0 ? startConfigured : Math.max(0, latest - maxBlocks)

  const items: MinerPurchaseItem[] = []
  for (let from = fromBlock; from <= latest; from += step + 1) {
    const to = Math.min(from + step, latest)
    try {
      const logs = await provider.getLogs({ address: config.contractAddress, fromBlock: from, toBlock: to, topics: [TOPIC, paddedUser] })
      for (const lg of logs) {
        try {
          const parsed = IFACE.parseLog(lg)
          const amountRaw = BigInt(parsed?.args?.amount?.toString() || '0')
          const startTime = Number(parsed?.args?.startTime || 0)
          const endTime = Number(parsed?.args?.endTime || 0)
          const now = Math.floor(Date.now() / 1000)
          const active = now < endTime
          const daysLeft = Math.max(0, Math.ceil((endTime * 1000 - Date.now()) / (24 * 3600 * 1000)))
          items.push({
            txHash: (lg as any).transactionHash || '',
            date: new Date(startTime * 1000).toISOString().slice(0, 10),
            amount: formatUnits(amountRaw, config.usdtDecimals),
            active,
            daysLeft,
            startTime,
            endTime,
          })
        } catch {}
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 80))
  }
  items.sort((a, b) => b.startTime - a.startTime)
  return items
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

  // On-chain data
  const { data: onChainData, isLoading: isOnChainLoading } = useQuery<OnChainData | null>({
    queryKey: ['onChainData', account],
    enabled: isValidAddress(account),
    refetchInterval: 30000,
    retry: 1,
    queryFn: async () => {
      if (!isValidAddress(account)) return null
      const [balance, hasCode, fee] = await Promise.all([getUserBalance(account!), hasSetFundCode(account!), getRegistrationFee()])
      return { userBalance: balance, hasFundCode: hasCode, registrationFee: fee }
    },
  })

  // Referrals
  const { data: referralList = [], isLoading: isRefsLoading } = useQuery<string[]>({
    queryKey: ['referralsL1', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return []
      return getLevel1ReferralIdsFromChain(account!)
    },
  })

  // Mining stats
  useQuery<{ count: number; totalDeposited: string }>({
    queryKey: ['miningStats', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return { count: 0, totalDeposited: '0.00' }
      return getUserMiningStats(account!)
    },
  })

  // Off-chain stats
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

  // Claim state
  const [claimedToday, setClaimedToday] = useState<boolean>(false)
  const [nextResetMs, setNextResetMs] = useState<number | null>(null)
  const [countdown, setCountdown] = useState<string>('')

  useEffect(() => {
    if (!stats?.logins) return
    setClaimedToday(Boolean(stats.logins.today_claimed))
    setNextResetMs(Number(stats.logins.next_reset_utc_ms || 0))
  }, [stats?.logins?.today_claimed, stats?.logins?.next_reset_utc_ms])

  const resetTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (!claimedToday || !nextResetMs) return
    const delay = Math.max(0, nextResetMs - Date.now())
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(async () => {
      setClaimedToday(false)
      await refetchStatsLite()
    }, delay)
    return () => { if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current) }
  }, [claimedToday, nextResetMs, refetchStatsLite])

  useEffect(() => {
    if (!claimedToday || !nextResetMs) { setCountdown(''); return }
    let id: number | null = null
    const tick = () => {
      const ms = Math.max(0, nextResetMs - Date.now())
      const s = Math.floor(ms / 1000)
      const hh = String(Math.floor(s / 3600)).padStart(2, '0')
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      setCountdown(`${hh}:${mm}:${ss}`)
    }
    tick()
    id = window.setInterval(tick, 1000)
    return () => { if (id) window.clearInterval(id) }
  }, [claimedToday, nextResetMs])

  // Auto-sync off-chain profile
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
      } catch {} finally {
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

  // Modals
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

  // Miner history modal
  const [showHistory, setShowHistory] = useState(false)
  const { data: history = [], isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery<MinerPurchaseItem[]>({
    queryKey: ['minerHistory', account],
    enabled: showHistory && isValidAddress(account),
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!isValidAddress(account)) return []
      return fetchMinerHistoryFromChain(account!)
    },
  })

  // Actions
  const handleUserPayout = () => {
    if (!onChainData?.hasFundCode) { showErrorToast('Fund code not set. Please register with a fund code.'); return }
    openFundModal()
  }

  const handleMarkTodayLogin = async () => {
    if (!isValidAddress(account)) return
    setIsProcessing(true)
    try {
      const { timestamp, signature } = await signAuthMessage(account!)
      let resp: Awaited<ReturnType<typeof markLogin>> | null = null
      try {
        resp = await markLogin(account!, timestamp, signature)
      } catch (err: any) {
        const status = err?.response?.status || err?.status
        if (status === 404) {
          await upsertUserFromChain(account!, timestamp, signature)
          resp = await markLogin(account!, timestamp, signature)
        } else {
          throw err
        }
      }
      const data = resp?.data as any
      if (data) {
        setClaimedToday(Boolean(data.today_claimed))
        setNextResetMs(Number(data.next_reset_utc_ms || 0))
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
      try {
        if ((tx2 as any)?.hash) {
          await recordMiningPurchase(account!, (tx2 as any).hash)
        }
      } catch (e) {
        showErrorToast(e, 'Purchase recorded on-chain, but off-chain credit setup failed. Please refresh.')
      }
      showSuccessToast(`Purchased $${Number(miningAmount).toFixed(2)} mining power`)
      queryClient.invalidateQueries({ queryKey: ['miningStats', account] })
      refetchStatsLite()
      if (showHistory) await refetchHistory()
    } catch (e) {
      showErrorToast(e, 'Failed to buy miner')
    } finally {
      setIsProcessing(false)
    }
  }

  const canClaimToday = isValidAddress(account) && !isProcessing && !claimedToday
  const claimBtnLabel = claimedToday ? `Already signed${countdown ? ` • Resets in ${countdown}` : ''}` : 'Mark Today’s Login'

  // Renderers
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
            <button
              style={{ ...styles.button, ...(isProcessing || isOnChainLoading ? styles.buttonDisabled : {}) }}
              disabled={isProcessing || isOnChainLoading}
              onClick={handleUserPayout}
            >
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

      {/* Notice slider (safe: image + sandboxed script) */}
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
                  <br />Example: invest $5 USDT → 5 coins/day × 30 days.
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
              <button
                style={{ ...styles.buttonGhost, ...(isProcessing ? styles.buttonGhostDisabled : {}) }}
                onClick={() => setShowFundModal(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderHistoryModal = () => {
    if (!showHistory) return null
    return (
      <div style={styles.overlay} onClick={() => setShowHistory(false)}>
        <div className="lxr-surface" style={{ maxWidth: 700, width: '100%' }} onClick={(e) => e.stopPropagation()}>
          <div className="lxr-surface-lines" />
          <div className="lxr-surface-mesh" />
          <div className="lxr-surface-circuit" />
          <div className="lxr-surface-holo" />
          <div style={{ position: 'relative', zIndex: 2, padding: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 900 }}>Miner Purchase History</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="lxr-buy-btn" onClick={() => refetchHistory()} disabled={isHistoryLoading}>
                  {isHistoryLoading ? 'LOADING...' : 'Reload'}
                </button>
                <button style={styles.iconBtnGhost} onClick={() => setShowHistory(false)} aria-label="Close">✕</button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Amount (USDT)</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {isHistoryLoading ? (
                    <tr><td colSpan={5} style={styles.td}>Loading...</td></tr>
                  ) : (history || []).length === 0 ? (
                    <tr><td colSpan={5} style={{ ...styles.td, color: colors.textMuted }}>No purchases found</td></tr>
                  ) : (
                    (history || []).map((h, idx) => (
                      <tr key={h.txHash || `${h.startTime}-${idx}`}>
                        <td style={styles.td}>{idx + 1}</td>
                        <td style={styles.td}>{h.date}</td>
                        <td style={styles.td}>${Number(h.amount || '0').toFixed(2)}</td>
                        <td style={styles.td}>
                          {h.active ? (
                            <span style={styles.statusActive}>Active • {h.daysLeft}d left</span>
                          ) : (
                            <span style={styles.statusExpired}>Expired</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          {h.txHash ? (
                            <a
                              href={`https://testnet.bscscan.com/tx/${h.txHash}`}
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
              Note: Active = within 30 days from purchase. Amount is your invested USDT per purchase.
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
          <button
            style={{ ...styles.buttonGhost, ...styles.buttonGhostDisabled }}
            disabled
            title="Coming soon"
          >
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
              <button
                title="View Miner History"
                aria-label="View Miner History"
                style={styles.iconBtnGhost}
                onClick={() => setShowHistory(true)}
              >
                <IconInfo />
              </button>
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

      {/* Your stats */}
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
            <button
              style={{ ...styles.button, ...(!canClaimToday ? styles.buttonDisabled : {}) }}
              disabled={!canClaimToday}
              onClick={handleMarkTodayLogin}
              title={claimedToday ? 'Already signed today' : 'Mark Today’s Login'}
            >
              {claimBtnLabel}
            </button>
            {claimedToday && countdown && (
              <div style={{ ...styles.small, textAlign: 'center' }}>
                Next reset at UTC 00:00 • {countdown}
              </div>
            )}
          </div>
        </Surface>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      {renderCoinInfoModal()}
      {renderFundModal()}
      {renderHistoryModal()}

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
