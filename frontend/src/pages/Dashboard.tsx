// frontend/src/pages/Dashboard.tsx
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
} from '../utils/contract'
import { showSuccessToast, showErrorToast } from '../utils/notification'
import { markLogin, getStats, type StatsResponse } from '../services/api'
import { isValidAddress } from '../utils/wallet'

type OnChainData = {
  userBalance: string
  hasFundCode: boolean
  registrationFee: string
}

const colors = {
  bgLightGreen: '#e8f9f1',
  bgLightGreen2: '#e0f5ed',
  deepNavy: '#0b1b3b',
  navySoft: '#163057',
  accent: '#14b8a6',
  danger: '#b91c1c',
  white: '#ffffff',
  grayLine: 'rgba(11,27,59,0.10)',
}

const styles: Record<string, React.CSSProperties & Record<string, any>> = {
  page: {
    minHeight: '100vh',
    width: '100%',
    background: `linear-gradient(180deg, ${colors.bgLightGreen} 0%, ${colors.bgLightGreen2} 100%)`,
    color: colors.deepNavy,
    userSelect: 'none',
  },
  container: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '16px 12px 32px',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  brand: { fontWeight: 900, fontSize: 18, letterSpacing: 0.3 },

  // New user menu styles
  userMenuWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  userIdText: {
    fontWeight: 800,
    fontSize: 13,
    maxWidth: 160,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userMenuBtn: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: '1px solid rgba(11,27,59,0.15)',
    background: 'rgba(255,255,255,0.9)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    fontSize: 16,
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: 40,
    background: '#fff',
    border: `1px solid ${colors.grayLine}`,
    borderRadius: 10,
    boxShadow: '0 10px 20px rgba(11,27,59,0.12)',
    padding: 6,
    minWidth: 140,
    zIndex: 100,
  },
  dropdownItem: {
    width: '100%',
    textAlign: 'left' as const,
    padding: '8px 10px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: 700,
    color: colors.deepNavy,
  },

  // Icon-only nav
  navRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    marginBottom: 12,
  },
  navBtn: {
    height: 44,
    borderRadius: 10,
    border: `1px solid ${colors.grayLine}`,
    background: 'rgba(255,255,255,0.85)',
    fontWeight: 800,
    cursor: 'pointer',
  },
  navBtnActive: { background: colors.accent, color: '#fff', borderColor: colors.accent },
  navIcon: { fontSize: 18 },

  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'stretch' },
  card: {
    background: 'rgba(255,255,255,0.7)', border: `1px solid ${colors.grayLine}`,
    borderRadius: 14, padding: 14, minHeight: 140, boxShadow: '0 8px 18px rgba(11,27,59,0.06)',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardTitle: { margin: '0 0 6px 0', fontSize: 16, fontWeight: 900 },
  statRow: { display: 'grid', gridTemplateColumns: '1fr', gap: 8 },
  statBox: {
    background: 'rgba(255,255,255,0.85)', border: `1px solid ${colors.grayLine}`,
    borderRadius: 12, padding: 10, textAlign: 'center',
  },
  statLabel: { fontSize: 12, color: colors.navySoft },
  statValue: { fontSize: 22, fontWeight: 900 },
  balance: { fontSize: 26, fontWeight: 900, margin: '4px 0 6px' },
  button: {
    height: 44, borderRadius: 10, background: colors.accent, color: colors.white, border: 'none',
    fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', width: '100%',
  },
  buttonGhost: {
    height: 44, borderRadius: 10, background: 'transparent', color: colors.deepNavy,
    border: `1px solid ${colors.grayLine}`, fontSize: 14, fontWeight: 800, cursor: 'pointer',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, width: '100%' },
  input: {
    height: 40, borderRadius: 10, border: `1px solid ${colors.grayLine}`, padding: '0 10px',
    background: colors.white, outline: 'none', color: colors.deepNavy, fontSize: 14, width: '100%',
  },
  copyWrap: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, alignItems: 'center' },
  small: { fontSize: 12, color: colors.navySoft },
  divider: { height: 1, background: colors.grayLine, margin: '6px 0' },
}

// Lexori Mining Card CSS (scoped)
const lexoriCSS = `
.lxr-mining-card {
  color: #fff;
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 16px;
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1.586;
  margin: 0 auto;
  background:
    radial-gradient(circle at 20% 20%, rgba(20,184,166,0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(232,249,241,0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 60%, rgba(22,48,87,0.2) 0%, transparent 50%),
    linear-gradient(135deg, #0b1b3b 0%, #163057 30%, #0b1b3b 70%, #163057 100%);
  box-shadow:
    0 15px 30px rgba(0,0,0,0.6),
    inset 0 1px 0 rgba(255,255,255,0.1),
    inset 0 0 50px rgba(20,184,166,0.05);
  transition: all 0.4s ease;
  border: 1px solid rgba(20,184,166,0.2);
}
.lxr-mining-card:hover {
  transform: translateY(-6px);
  box-shadow:
    0 30px 60px rgba(0,0,0,0.5),
    inset 0 1px 0 rgba(255,255,255,0.2);
}
.lxr-network-lines, .lxr-crypto-mesh, .lxr-circuit {
  position: absolute; inset: 0; pointer-events: none;
}
.lxr-network-lines {
  opacity: .15;
  background-image:
    radial-gradient(circle at 20% 30%, #14b8a6 2px, transparent 2px),
    radial-gradient(circle at 80% 70%, #e8f9f1 2px, transparent 2px),
    radial-gradient(circle at 60% 20%, #163057 2px, transparent 2px),
    radial-gradient(circle at 40% 80%, #14b8a6 1px, transparent 1px),
    radial-gradient(circle at 90% 30%, #e0f5ed 1px, transparent 1px);
  background-size: 60px 60px, 80px 80px, 70px 70px, 40px 40px, 50px 50px;
}
.lxr-crypto-mesh {
  opacity: .08;
  background-image:
    linear-gradient(30deg, transparent 40%, rgba(20,184,166,0.3) 41%, rgba(20,184,166,0.3) 42%, transparent 43%),
    linear-gradient(150deg, transparent 40%, rgba(232,249,241,0.3) 41%, rgba(232,249,241,0.3) 42%, transparent 43%),
    linear-gradient(90deg, transparent 40%, rgba(22,48,87,0.3) 41%, rgba(22,48,87,0.3) 42%, transparent 43%);
  background-size: 120px 120px, 100px 100px, 80px 80px;
}
.lxr-circuit {
  opacity: .2;
  background-image:
    linear-gradient(90deg, rgba(20,184,166,0.1) 1px, transparent 1px),
    linear-gradient(rgba(20,184,166,0.1) 1px, transparent 1px);
  background-size: 20px 20px;
}
.lxr-holo {
  position: absolute; top: 0; left: 0; height: 4px; width: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(20,184,166,0.35) 25%,
    rgba(232,249,241,0.35) 50%,
    rgba(224,245,237,0.35) 75%,
    transparent 100%
  );
  animation: lxr-holographic 3s ease-in-out infinite;
}
@keyframes lxr-holographic {
  0%, 100% { transform: translateX(-100%); }
  50% { transform: translateX(300%); }
}
.lxr-lexori-logo {
  background: linear-gradient(45deg, #14b8a6, #e8f9f1, #14b8a6);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 30px rgba(20, 184, 166, 0.5);
}
.lxr-coin-icon {
  width: 42px; height: 42px; border-radius: 9999px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(45deg, #14b8a6, #e8f9f1);
  color: #000; font-weight: 800;
  animation: lxr-coinRotate 4s linear infinite;
}
@keyframes lxr-coinRotate {
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(360deg); }
}
.lxr-panel {
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 12px;
}
.lxr-quantity {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.05);
  border: 2px solid rgba(20,184,166,0.3);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  transition: all .3s ease;
}
.lxr-quantity:focus {
  background: rgba(255,255,255,0.1);
  border-color: #14b8a6;
  outline: none;
  box-shadow: 0 0 20px rgba(20,184,166,0.3);
}
.lxr-quantity.lxr-invalid {
  border-color: #ef4444;
  box-shadow: 0 0 20px rgba(239,68,68,0.3);
}
.lxr-buy-btn {
  min-width: 130px;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(45deg, #14b8a6, #e0f5ed);
  box-shadow: 0 4px 15px rgba(20,184,166,0.3);
  cursor: pointer;
  transition: all .3s ease;
}
.lxr-buy-btn:hover {
  background: linear-gradient(45deg, #e0f5ed, #14b8a6);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(20,184,166,0.4);
}
.lxr-buy-btn:disabled {
  opacity: .7; filter: grayscale(0.3); cursor: not-allowed;
}
.lxr-msg {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  text-align: center;
  font-weight: 700;
  color: #fff;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.15);
}
.lxr-msg--success {
  background: linear-gradient(90deg, #22c55e, #16a34a);
}
.lxr-msg--error {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}
`

const Dashboard: React.FC = () => {
  const { account, userId, disconnect } = useWallet()
  const queryClient = useQueryClient()
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'home' | 'surprise'>('home')

  // New: dropdown state
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Inline success/error message for mining card
  const [inlineMsg, setInlineMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  useEffect(() => {
    if (!inlineMsg) return
    const t = setTimeout(() => setInlineMsg(null), 4000)
    return () => clearTimeout(t)
  }, [inlineMsg])

  // Prevent copy/select/context menu
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    document.addEventListener('copy', prevent)
    document.addEventListener('cut', prevent)
    document.addEventListener('contextmenu', prevent)
    document.addEventListener('selectstart', prevent)
    return () => {
      document.removeEventListener('copy', prevent)
      document.removeEventListener('cut', prevent)
      document.removeEventListener('contextmenu', prevent)
      document.removeEventListener('selectstart', prevent)
    }
  }, [])

  // Close user menu on outside click or ESC
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // On-chain data
  const { data: onChainData, isLoading: isOnChainLoading } = useQuery<OnChainData | null>({
    queryKey: ['onChainData', account],
    enabled: isValidAddress(account),
    refetchInterval: 30000,
    retry: 1,
    queryFn: async () => {
      if (!isValidAddress(account)) return null
      const [balance, hasCode, fee] = await Promise.all([
        getUserBalance(account!),
        hasSetFundCode(account!),
        getRegistrationFee(),
      ])
      return { userBalance: balance, hasFundCode: hasCode, registrationFee: fee }
    },
  })

  // L1 referrals
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
  const { data: miningStats } = useQuery<{ count: number; totalDeposited: string }>({
    queryKey: ['miningStats', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return { count: 0, totalDeposited: '0.00' }
      return getUserMiningStats(account!)
    },
  })

  // Off-chain stats (coin balance + login days)
  const {
    data: stats,
    isLoading: isStatsLoading,
    refetch: refetchStatsLite,
  } = useQuery<StatsResponse | null>({
    queryKey: ['stats-lite', account],
    enabled: isValidAddress(account),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return null
      try {
        const res = await getStats(account!)
        return res.data
      } catch (err: any) {
        const status = err?.response?.status || err?.status
        if (status === 404) return null
        throw err
      }
    },
  })

  const referralCode = useMemo(() => (userId || '').toUpperCase(), [userId])
  const displayUserId = useMemo(
    () => (userId || stats?.userId || 'USER').toUpperCase(),
    [userId, stats?.userId]
  )
  const referralLink = useMemo(
    () => `${window.location.origin}/register?ref=${referralCode}`,
    [referralCode]
  )

  const safeMoney = (val?: string) => {
    const n = parseFloat(val || '0')
    if (isNaN(n)) return '0.00'
    return n.toFixed(2)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showSuccessToast('Copied to clipboard')
  }

  const coinBalance = stats?.coin_balance ?? 0

  // ---------------- Handlers ----------------
  const handleUserPayout = async () => {
    if (!onChainData?.hasFundCode) {
      showErrorToast('Fund code not set. Please register with a fund code.')
      return
    }
    const code = window.prompt('Enter your secret Fund Code')
    if (!code) return
    setIsProcessing(true)
    try {
      const tx = await withdrawWithFundCode(code)
      if ((tx as any)?.wait) await (tx as any).wait()
      showSuccessToast('Payout successful!')
    } catch (e) {
      showErrorToast(e, 'Payout failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMarkTodayLogin = async () => {
    if (!isValidAddress(account)) return
    setIsProcessing(true)
    try {
      const { timestamp, signature } = await signAuthMessage(account!)
      await markLogin(account!, timestamp, signature)
      showSuccessToast('Login counted for today')
      await refetchStatsLite()
    } catch (e) {
      showErrorToast(e, 'Unable to mark login')
    } finally {
      setIsProcessing(false)
    }
  }

  const [miningAmount, setMiningAmount] = useState<string>('5.00')
  const amountNum = Number(miningAmount || '0')
  const isInvalidAmount = miningAmount !== '' && (isNaN(amountNum) || amountNum < 5)

  const handleBuyMiner = async () => {
    if (!isValidAddress(account)) return
    // validate min 5
    if (isNaN(amountNum) || amountNum < 5) {
      setInlineMsg({ type: 'error', text: 'Minimum $5.00 required!' })
      showErrorToast('Minimum 5 USDT required.')
      return
    }

    setIsProcessing(true)
    try {
      const tx1 = await approveUSDT(miningAmount)
      if ((tx1 as any)?.wait) await (tx1 as any).wait()
      const tx2 = await buyMiner(miningAmount)
      if ((tx2 as any)?.wait) await (tx2 as any).wait()

      showSuccessToast('Miner purchased on-chain')
      setInlineMsg({
        type: 'success',
        text: `Successfully purchased $${Number(miningAmount).toFixed(2)} worth of Lexori Coin mining power!`,
      })
      setMiningAmount('5.00')
      queryClient.invalidateQueries({ queryKey: ['miningStats', account] })
    } catch (e) {
      showErrorToast(e, 'Failed to buy miner')
    } finally {
      setIsProcessing(false)
    }
  }

  // --------------- Views ---------------
  const renderHome = () => (
    <div style={styles.grid}>
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Available Balance</h3>
        {isOnChainLoading ? (
          <div style={{ height: 26, background: '#eef2f6', borderRadius: 8 }} />
        ) : (
          <div style={styles.balance}>${safeMoney(onChainData?.userBalance)}</div>
        )}
        <div style={styles.row}>
          <button
            style={styles.button}
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
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Share & Earn</h3>
        <div style={{ marginBottom: 8 }}>
          <div style={{ ...styles.small, marginBottom: 4 }}>Referral Code</div>
          <div style={styles.copyWrap}>
            <input style={styles.input} readOnly value={referralCode || ''} />
            <button style={styles.button} onClick={() => copyToClipboard(referralCode)}>
              Copy
            </button>
          </div>
        </div>
        <div>
          <div style={{ ...styles.small, marginBottom: 4 }}>Referral Link</div>
          <div style={styles.copyWrap}>
            <input style={styles.input} readOnly value={referralLink} />
            <button style={styles.button} onClick={() => copyToClipboard(referralLink)}>
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderSurprise = () => {
    const year = new Date().getFullYear()
    const cardId = `LXR-${year}-001`
    return (
      <div style={styles.grid}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Total Coin Balance</h3>
          <div style={styles.balance}>
            {isStatsLoading ? '...' : coinBalance}
          </div>
          <button style={styles.buttonGhost} disabled>
            Withdraw (Coming Soon)
          </button>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Mining</h3>

          {/* Scoped CSS for Lexori card */}
          <style dangerouslySetInnerHTML={{ __html: lexoriCSS }} />

          {/* Lexori Mining Card */}
          <div className="lxr-mining-card">
            <div className="lxr-network-lines" />
            <div className="lxr-crypto-mesh" />
            <div className="lxr-circuit" />
            <div className="lxr-holo" />

            <div style={{ position: 'relative', zIndex: 2 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div className="lxr-lexori-logo" style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>
                    LEXORI
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#14b8a6' }}>
                    MINING CARD
                  </div>
                </div>
                <div className="lxr-coin-icon">L</div>
              </div>

              {/* Info */}
              <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#14b8a6' }}>
                You will receive coins equal to your investment amount daily for 30 days
              </div>

              {/* Purchase */}
              <div className="lxr-panel" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="lxr-qty" style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: '#14b8a6' }}>
                      Quantity (USD)
                    </label>
                    <input
                      id="lxr-qty"
                      className={`lxr-quantity ${isInvalidAmount ? 'lxr-invalid' : ''}`}
                      type="number"
                      min={5}
                      step="0.01"
                      placeholder="5.00"
                      value={miningAmount}
                      onChange={(e) => setMiningAmount(e.target.value)}
                    />
                  </div>
                  <button
                    className="lxr-buy-btn"
                    onClick={handleBuyMiner}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'PROCESSING...' : 'BUY NOW'}
                  </button>
                </div>
              </div>

              {/* Minimum */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#d1d5db', fontSize: 12, marginBottom: 4 }}>Minimum Purchase Option</div>
                <div style={{ color: '#14b8a6', fontSize: 20, fontWeight: 800 }}>$5.00 USD</div>
              </div>

              {/* Serial */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>CARD ID</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#14b8a6' }}>{cardId}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>VALID THRU</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#22d3ee' }}>12/25</div>
                </div>
              </div>
            </div>
          </div>

          {/* Inline success/error message */}
          {!!inlineMsg && (
            <div className={`lxr-msg ${inlineMsg.type === 'success' ? 'lxr-msg--success' : 'lxr-msg--error'}`}>
              {inlineMsg.type === 'success' ? (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
              )}
              <span>{inlineMsg.text}</span>
            </div>
          )}

          {/* Mining stats (summary) */}
          <div style={{ ...styles.small, marginTop: 10 }}>
            Your Mining Stats: Miners <strong>{miningStats?.count ?? 0}</strong> • Total Deposited{' '}
            <strong>${safeMoney(miningStats?.totalDeposited)}</strong>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Your Stats</h3>
          <div style={styles.statRow}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>Total Refer (L1)</div>
              <div style={styles.statValue}>{isRefsLoading ? '...' : referralList.length}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>Total Login (days)</div>
              <div style={styles.statValue}>{isStatsLoading ? '...' : (stats?.logins?.total_login_days ?? 0)}</div>
            </div>
          </div>
          <div style={{ ...styles.row, marginTop: 8 }}>
            <button
              style={styles.button}
              disabled={isProcessing || !account}
              onClick={handleMarkTodayLogin}
            >
              Mark Today’s Login
            </button>
          </div>
          {!!onChainData && (
            <>
              <div style={styles.divider} />
              <div style={styles.small}>
                Registration fee (on‑chain): <strong>${safeMoney(onChainData.registrationFee)}</strong>
              </div>
              <div style={{ ...styles.small, marginTop: 4 }}>
                Commission percentages — L1: 40% • L2: 20% • L3: 10% (estimated on‑chain)
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.brand}>Web3 Community</div>

          {/* userId + user icon with dropdown */}
          <div style={styles.userMenuWrap} ref={menuRef}>
            <span style={styles.userIdText} title={displayUserId}>{displayUserId}</span>
            <button
              style={styles.userMenuBtn}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="User menu"
              title="User menu"
            >
              👤
            </button>
            {menuOpen && (
              <div style={styles.dropdown} role="menu">
                <button
                  style={styles.dropdownItem}
                  onClick={() => {
                    setMenuOpen(false)
                    disconnect()
                  }}
                  role="menuitem"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Icon-only navigation */}
        <div style={styles.navRow}>
          <button
            style={{ ...styles.navBtn, ...(activeTab === 'home' ? styles.navBtnActive : {}) }}
            onClick={() => setActiveTab('home')}
            title="Home"
            aria-label="Home"
          >
            <span style={styles.navIcon}>🏠</span>
          </button>
          <button
            style={{ ...styles.navBtn, ...(activeTab === 'surprise' ? styles.navBtnActive : {}) }}
            onClick={() => setActiveTab('surprise')}
            title="Surprise"
            aria-label="Surprise"
          >
            <span style={styles.navIcon}>🎁</span>
          </button>
        </div>

        {activeTab === 'home' ? renderHome() : renderSurprise()}
      </div>
    </div>
  )
}

export default Dashboard
