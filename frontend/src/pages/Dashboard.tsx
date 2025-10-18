// frontend/src/pages/Dashboard.tsx
import React, { useEffect, useMemo, useState } from 'react'
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
import { markLogin } from '../services/api'
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
  userBox: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'rgba(11,27,59,0.12)', display: 'grid', placeItems: 'center', fontWeight: 800,
  },
  logoutBtn: {
    height: 36, padding: '0 12px', borderRadius: 10,
    border: '1px solid rgba(11,27,59,0.15)', background: 'rgba(255,255,255,0.7)',
    cursor: 'pointer', fontWeight: 700,
  },

  // Icon-only top navigation
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

const Dashboard: React.FC = () => {
  const { account, userId, disconnect } = useWallet()
  const queryClient = useQueryClient()
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'home' | 'surprise'>('home')

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

  // On-chain data (direct reads) — user only
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

  // L1 referrals from chain (userId list)
  const { data: referralList = [], isLoading: isRefsLoading } = useQuery<string[]>({
    queryKey: ['referralsL1', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return []
      return getLevel1ReferralIdsFromChain(account!)
    },
  })

  // Mining stats from chain
  const { data: miningStats } = useQuery<{ count: number; totalDeposited: string }>({
    queryKey: ['miningStats', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return { count: 0, totalDeposited: '0.00' }
      return getUserMiningStats(account!)
    },
  })

  const referralCode = useMemo(() => (userId || '').toUpperCase(), [userId])
  const referralLink = useMemo(
    () => `${window.location.origin}/register?ref=${referralCode}`,
    [referralCode]
  )
  const initials = (referralCode || 'U').slice(0, 2).toUpperCase()

  const safeMoney = (val?: string) => {
    const n = parseFloat(val || '0')
    if (isNaN(n)) return '0.00'
    return n.toFixed(2)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showSuccessToast('Copied to clipboard')
  }

  // Off-chain coin balance placeholder (getStats removed as per requirement)
  const coinBalance = 0

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
    } catch (e) {
      showErrorToast(e, 'Unable to mark login')
    } finally {
      setIsProcessing(false)
    }
  }

  const [miningAmount, setMiningAmount] = useState<string>('')
  const amountNum = Number(miningAmount || '0')
  const canBuy = !!account && amountNum >= 5

  const handleBuyMiner = async () => {
    if (!isValidAddress(account)) return
    if (!canBuy) {
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
      setMiningAmount('')
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

  const renderSurprise = () => (
    <div style={styles.grid}>
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Total Coin Balance</h3>
        <div style={styles.balance}>{coinBalance}</div>
        <button style={styles.buttonGhost} disabled>
          Withdraw (Coming Soon)
        </button>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Mining</h3>
        <div style={styles.small}>
          Buy a miner with USDT (min 5 USDT). Points will be derived from on‑chain events.
        </div>
        <div style={{ ...styles.row, marginTop: 6 }}>
          <input
            style={styles.input}
            type="number"
            min={0}
            step="0.1"
            placeholder="Enter amount in USDT (min 5)"
            value={miningAmount}
            onChange={(e) => setMiningAmount(e.target.value)}
          />
          <button
            className="buy-miner"
            style={styles.button}
            disabled={!canBuy || isProcessing}
            onClick={handleBuyMiner}
          >
            Approve & Buy Miner
          </button>
        </div>
        <div style={{ ...styles.small, marginTop: 6 }}>
          Your Mining Stats: Miners <strong>{miningStats?.count ?? 0}</strong> • Total Deposited{' '}
          <strong>${safeMoney(miningStats?.totalDeposited)}</strong>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Your Stats</h3>
        <div style={styles.statRow}>
          <div style={styles.statBox}>
            <div style={styles.statLabel}>Total Refer (L1)</div>
            <div style={styles.statValue}>
              {isRefsLoading ? '...' : referralList.length}
            </div>
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

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.brand}>Web3 Community</div>
          <div style={styles.userBox}>
            <div style={styles.avatar}>{initials}</div>
            <button
              style={styles.logoutBtn}
              onClick={() => {
                disconnect()
              }}
            >
              Logout
            </button>
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
