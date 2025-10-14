// frontend/src/pages/Dashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '../context/WalletContext'
import {
  withdrawWithFundCode,
  getUserBalance,
  hasSetFundCode,
  getOwner,
  isAdmin,
  getAdminCommission,
  getContractBalance,
  withdrawCommission,
  emergencyWithdrawAll,
  signAuthMessage,
  approveUSDT,
  buyMiner,
  withdrawLiquidity,
  getUserMiningStats,
} from '../utils/contract'
import { showSuccessToast, showErrorToast } from '../utils/notification'
import { api, getDashboardData, getUserBootstrap, upsertUserFromChain } from '../services/api'
import { isValidAddress } from '../utils/wallet'
import { ethers, BrowserProvider } from 'ethers'

type Role = 'user' | 'admin' | 'owner'

type OnChainData = {
  userBalance: string
  hasFundCode: boolean
  role: Role
  contractBalance?: string
  adminCommission?: string
}

type OffChainData = {
  userId: string
  coin_balance: number
  referralStats: {
    total_referrals: number
    level1_count: number
    level2_count: number
    level3_count: number
  }
  logins: { total_login_days: number }
  notices: Array<{
    id: number
    title: string
    content_html: string
    image_url?: string
    link_url?: string
    priority: number
    created_at: string
  }>
  commissions?: {
    percentages: { l1: number; l2: number; l3: number }
    registration_fee_raw: string
    l1_total_raw: string
    l2_total_raw: string
    l3_total_raw: string
    total_estimated_raw: string
  }
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
    padding: '0 12px', width: '100%',
  },
  buttonDanger: {
    height: 44, borderRadius: 10, background: colors.danger, color: colors.white, border: 'none',
    fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', width: '100%',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, width: '100%' },
  input: {
    height: 40, borderRadius: 10, border: `1px solid ${colors.grayLine}`, padding: '0 10px',
    background: colors.white, outline: 'none', color: colors.deepNavy, fontSize: 14, width: '100%',
  },
  copyWrap: { display: 'grid', gridTemplateColumns: '1fr', gap: 8, alignItems: 'center' },
  noticeScroller: {
    display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x mandatory' as any,
  },
  noticeCard: {
    minWidth: '92%', maxWidth: '92%', background: 'rgba(255,255,255,0.9)', border: `1px solid ${colors.grayLine}`,
    borderRadius: 12, padding: 10, flex: '0 0 auto', cursor: 'pointer', scrollSnapAlign: 'start',
  },
  noticeImg: {
    width: '100%', height: 140, objectFit: 'cover' as const, borderRadius: 10, marginBottom: 8, background: '#f2f5f7',
  },
  small: { fontSize: 12, color: colors.navySoft },
  muted: { opacity: 0.8 },
  textarea: {
    minHeight: 120, borderRadius: 10, padding: 10, border: `1px solid ${colors.grayLine}`,
    fontFamily: 'monospace', fontSize: 13, background: colors.white, color: colors.deepNavy,
    outline: 'none', width: '100%',
  },
  divider: { height: 1, background: colors.grayLine, margin: '6px 0' },

  tabRow: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 },
  tabBtn: {
    height: 36, borderRadius: 10, border: `1px solid ${colors.grayLine}`, background: 'rgba(255,255,255,0.85)',
    fontWeight: 800, cursor: 'pointer',
  },
  tabBtnActive: { background: colors.accent, color: '#fff', borderColor: colors.accent },
  previewImg: {
    width: '100%', maxHeight: 200, objectFit: 'cover' as const, borderRadius: 10, border: `1px solid ${colors.grayLine}`,
  },

  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 12,
  },
  modal: {
    width: '100%',
    maxWidth: 460,
    background: '#fff',
    borderRadius: 14,
    border: `1px solid ${colors.grayLine}`,
    boxShadow: '0 12px 28px rgba(11,27,59,0.12)',
    padding: 16,
    color: colors.deepNavy,
  },
  stepRow: {
    display: 'grid',
    gridTemplateColumns: '24px 1fr',
    gap: 8,
    alignItems: 'start',
  },
  stepDot: (bg: string): React.CSSProperties => ({
    width: 12, height: 12, marginTop: 4,
    borderRadius: '50%', background: bg,
  }),
}

const DangerousHtml: React.FC<{ html: string }> = ({ html }) => {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = html || ''
    const scripts = Array.from(ref.current.querySelectorAll('script'))
    scripts.forEach((oldScript) => {
      const s = document.createElement('script')
      for (const { name, value } of Array.from(oldScript.attributes)) s.setAttribute(name, value)
      s.textContent = oldScript.textContent
      oldScript.replaceWith(s)
    })
  }, [html])
  return <div ref={ref} />
}

// small helper
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const Dashboard: React.FC = () => {
  const { account, userId, disconnect } = useWallet()
  const queryClient = useQueryClient()
  const [isProcessing, setIsProcessing] = useState(false)

  // Modal: step-by-step "Sign your data" sync
  const [showSignModal, setShowSignModal] = useState(false)
  const [syncInProgress, setSyncInProgress] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number>(0)
  const [syncError, setSyncError] = useState<string>('')

  type StepStatus = 'idle' | 'running' | 'done' | 'error'
  const [steps, setSteps] = useState<{ sign: StepStatus; submit: StepStatus; verify: StepStatus }>({
    sign: 'idle',
    submit: 'idle',
    verify: 'idle',
  })

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

  // Reset modal state on account change
  useEffect(() => {
    setShowSignModal(false)
    setSyncInProgress(false)
    setSyncError('')
    setSteps({ sign: 'idle', submit: 'idle', verify: 'idle' })
  }, [account])

  // On-chain data
  const { data: onChainData, isLoading: isOnChainLoading } = useQuery<OnChainData | null>({
    queryKey: ['onChainData', account],
    enabled: isValidAddress(account),
    refetchInterval: 30000,
    retry: 1,
    queryFn: async () => {
      if (!isValidAddress(account)) return null
      const [owner, adminFlag, balance, hasCode] = await Promise.all([
        getOwner(),
        isAdmin(account!),
        getUserBalance(account!),
        hasSetFundCode(account!),
      ])
      let role: Role = 'user'
      if (account!.toLowerCase() === owner.toLowerCase()) role = 'owner'
      else if (adminFlag) role = 'admin'
      const data: OnChainData = { userBalance: balance, hasFundCode: hasCode, role }
      if (role !== 'user') {
        const [contractBal, adminComm] = await Promise.all([getContractBalance(), getAdminCommission(account!)])
        data.contractBalance = contractBal
        data.adminCommission = adminComm
      }
      return data
    },
  })

  // Off-chain dashboard data
  const {
    data: offChainData,
    isLoading: isOffChainLoading,
    refetch: refetchOffChain,
  } = useQuery<OffChainData | null>({
    queryKey: ['offChainData', account],
    enabled: isValidAddress(account),
    retry: false, // no auto-retry to avoid load; we'll control via modal
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!isValidAddress(account)) return null
      try {
        const res = await getDashboardData(account!)
        return res.data as OffChainData
      } catch (err: any) {
        const status = err?.response?.status || err?.status
        if (status === 404) {
          // DB-তে ইউজার নেই → modal দেখান
          setShowSignModal(true)
          return null
        }
        throw err
      }
    },
  })

  // Level-1 referral list
  const { data: referralList = [], isLoading: isRefsLoading } = useQuery<string[]>({
    queryKey: ['referrals', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      try {
        const r = await api.get(`/api/referrals/${account}`)
        if (Array.isArray(r.data?.list)) return r.data.list as string[]
      } catch {}
      return []
    },
  })

  const referralCode = useMemo(
    () => (userId || offChainData?.userId || '').toUpperCase(),
    [userId, offChainData?.userId]
  )
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

  // ---------------- Step-by-step Sign & Sync (modal) ----------------
  const startSignAndSync = async () => {
    setSyncError('')
    if (!isValidAddress(account)) {
      setSyncError('Wallet not connected')
      return
    }
    const now = Date.now()
    if (now - lastSyncAt < 5000) {
      setSyncError('Please wait a few seconds before trying again.')
      return
    }
    if (syncInProgress) return

    setSyncInProgress(true)
    setSteps({ sign: 'running', submit: 'idle', verify: 'idle' })

    try {
      // 1) Sign message
      const { timestamp, signature } = await signAuthMessage(account!)
      setSteps((s) => ({ ...s, sign: 'done', submit: 'running' }))
      await sleep(300) // small pacing

      // 2) Submit upsert (backend has rate-limit too)
      await upsertUserFromChain(account!, timestamp, signature)
      setSteps((s) => ({ ...s, submit: 'done', verify: 'running' }))

      // 3) Verify: poll bootstrap (max 3 tries, exponential backoff)
      let ok = false
      const delays = [800, 1600, 2600]
      for (let i = 0; i < delays.length; i++) {
        await sleep(delays[i])
        try {
          const { data } = await getUserBootstrap(account!)
          if (data?.action === 'redirect_dashboard') {
            ok = true
            break
          }
        } catch {}
      }
      if (!ok) {
        // last attempt: light refetch dashboard once
        try {
          await refetchOffChain()
          ok = true
        } catch {}
      }

      if (!ok) {
        setSteps((s) => ({ ...s, verify: 'error' }))
        setSyncError('Sync completed but verification failed. Please try again in a moment.')
        return
      }

      setSteps((s) => ({ ...s, verify: 'done' }))
      setLastSyncAt(Date.now())

      // Refresh queries gently
      await queryClient.invalidateQueries({ queryKey: ['offChainData', account] })
      await queryClient.invalidateQueries({ queryKey: ['referrals', account] })

      // Close modal after a short delay
      await sleep(400)
      setShowSignModal(false)
      showSuccessToast('Your data has been synced successfully.')
    } catch (e) {
      setSteps((s) => ({
        ...s,
        sign: s.sign === 'running' ? 'error' : s.sign,
        submit: s.submit === 'running' ? 'error' : s.submit,
      }))
      setSyncError(typeof (e as any)?.message === 'string' ? (e as any).message : 'Sync failed')
    } finally {
      setSyncInProgress(false)
    }
  }

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

  const handleAdminPayout = async () => {
    setIsProcessing(true)
    try {
      const tx = await withdrawCommission()
      if ((tx as any)?.wait) await (tx as any).wait()
      showSuccessToast('Commission withdrawn')
    } catch (e) {
      showErrorToast(e, 'Commission withdrawal failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleEmergencyWithdraw = async () => {
    if (!onChainData || onChainData.role !== 'owner') return
    if (!window.confirm('Withdraw all contract funds to owner wallet?')) return
    setIsProcessing(true)
    try {
      const tx = await emergencyWithdrawAll()
      if ((tx as any)?.wait) await (tx as any).wait()
      showSuccessToast('Emergency withdraw completed')
    } catch (e) {
      showErrorToast(e, 'Emergency withdraw failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMarkTodayLogin = async () => {
    if (!isValidAddress(account)) return
    setIsProcessing(true)
    try {
      const { timestamp, signature } = await signAuthMessage(account!)
      await api.post(`/api/users/${account}/login`, { timestamp, signature })
      showSuccessToast('Login counted for today')
      refetchOffChain()
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
      try {
        await api.post('/api/forms/mining/submit', {
          wallet_address: account,
          fields: { amount_usdt: amountNum, duration_days: 30, source: 'onchain' },
        })
      } catch {}
      showSuccessToast('Miner purchased on-chain')
      setMiningAmount('')
      // refresh any mining-related cache
      queryClient.invalidateQueries({ queryKey: ['miningStats', account] })
    } catch (e) {
      showErrorToast(e, 'Failed to buy miner')
    } finally {
      setIsProcessing(false)
    }
  }

  // --------------- UI ---------------
  const renderSignModal = () => {
    if (!showSignModal) return null
    const dot = (s: StepStatus) =>
      s === 'done' ? '#16a34a' : s === 'running' ? '#f59e0b' : s === 'error' ? '#b91c1c' : '#9ca3af'

    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <h3 style={{ margin: '0 0 8px 0', fontWeight: 900 }}>Sign your data</h3>
          <p style={{ margin: '0 0 10px 0', fontSize: 13, color: colors.navySoft }}>
            We couldn’t find your profile in the database. To sync it from the blockchain, please
            sign a message and let us update your profile securely.
          </p>

          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <div style={styles.stepRow}>
              <div style={styles.stepDot(dot(steps.sign))} />
              <div>
                <div style={{ fontWeight: 800 }}>Step 1 — Sign authorization message</div>
                <div style={{ fontSize: 12, color: colors.navySoft }}>
                  We request a simple message signature (free, no gas).
                </div>
              </div>
            </div>
            <div style={styles.stepRow}>
              <div style={styles.stepDot(dot(steps.submit))} />
              <div>
                <div style={{ fontWeight: 800 }}>Step 2 — Send to server</div>
                <div style={{ fontSize: 12, color: colors.navySoft }}>
                  Your signed message lets us fetch on‑chain data and upsert your profile.
                </div>
              </div>
            </div>
            <div style={styles.stepRow}>
              <div style={styles.stepDot(dot(steps.verify))} />
              <div>
                <div style={{ fontWeight: 800 }}>Step 3 — Verify & finish</div>
                <div style={{ fontSize: 12, color: colors.navySoft }}>
                  We’ll verify and refresh the dashboard automatically.
                </div>
              </div>
            </div>
          </div>

          {!!syncError && (
            <div style={{ marginTop: 10, color: colors.danger, fontSize: 13, fontWeight: 700 }}>
              {syncError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              style={{ ...styles.button, flex: 1 }}
              onClick={startSignAndSync}
              disabled={syncInProgress || !isValidAddress(account)}
            >
              {syncInProgress ? 'Syncing…' : 'Sign & Sync'}
            </button>
            <button
              style={{ ...styles.buttonGhost, flex: 1 }}
              onClick={() => {
                if (!syncInProgress) setShowSignModal(false)
              }}
              disabled={syncInProgress}
            >
              Cancel
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: colors.navySoft }}>
            Tip: If it doesn’t complete at once, please try again after a few seconds. We avoid
            sending too many requests at once to keep the network stable.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {renderSignModal()}

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
                onClick={onChainData?.role === 'user' ? handleUserPayout : handleAdminPayout}
              >
                {onChainData?.role === 'user' ? 'Payout' : 'Withdraw Commission'}
              </button>
            </div>

            <div style={styles.divider} />

            <div style={{ ...styles.small, marginTop: 6 }}>
              Total Coin Balance:{' '}
              <strong>{isOffChainLoading ? '...' : offChainData?.coin_balance ?? 0}</strong>
            </div>
            <div style={{ ...styles.small, marginTop: 4, lineHeight: 1.5 }}>
              Per Refer: 5 coins, Daily Login: 1 coin. <br />
              Mining rewards will also add here.
            </div>
            <button style={{ ...styles.buttonGhost, marginTop: 8 }} disabled={true}>
              Payout (Coming Soon)
            </button>

            {onChainData?.role !== 'user' && (
              <div style={{ marginTop: 6, ...styles.small }}>
                Contract: <strong>${safeMoney(onChainData?.contractBalance)}</strong> • Your
                Commission: <strong>${safeMoney(onChainData?.adminCommission)}</strong>
              </div>
            )}
            {onChainData?.role === 'owner' && (
              <div style={{ marginTop: 6 }}>
                <button
                  style={styles.buttonDanger}
                  disabled={isProcessing}
                  onClick={handleEmergencyWithdraw}
                >
                  Emergency Withdraw All
                </button>
              </div>
            )}
            {!isOnChainLoading && !onChainData?.hasFundCode && (
              <div style={{ ...styles.small, color: colors.danger, marginTop: 4 }}>
                Fund code not set. You must register with a fund code to withdraw.
              </div>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Notice Board</h3>
            <div style={styles.noticeScroller}>
              {(offChainData?.notices ?? []).map((n) => (
                <div
                  key={n.id}
                  style={styles.noticeCard}
                  onClick={() => {
                    if (n.link_url) window.open(n.link_url, '_blank')
                  }}
                  title={n.title}
                >
                  {n.image_url ? (
                    <img src={n.image_url} alt={n.title} style={styles.noticeImg as any} />
                  ) : (
                    <div style={styles.noticeImg as any} />
                  )}
                  <div style={{ fontWeight: 900, marginBottom: 4 }}>{n.title}</div>
                  <div style={{ ...styles.small, ...styles.muted, marginBottom: 6 }}>
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, color: colors.navySoft, maxHeight: 120, overflow: 'auto' }}>
                    <DangerousHtml html={n.content_html} />
                  </div>
                </div>
              ))}
              {(!offChainData || (offChainData.notices || []).length === 0) && (
                <div style={{ ...styles.small, ...styles.muted }}>No notices yet.</div>
              )}
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Mining</h3>
            <div style={styles.small}>
              Buy a miner with USDT (min 5 USDT). Points will be calculated off‑chain. Funds are held
              on‑chain as a vault.
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
            <MiningStats account={account} />
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Your Stats</h3>
            <div style={styles.statRow}>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Total Refer</div>
                <div style={styles.statValue}>
                  {isOffChainLoading ? '...' : offChainData?.referralStats?.total_referrals ?? 0}
                </div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Total Login (days)</div>
                <div style={styles.statValue}>
                  {isOffChainLoading ? '...' : offChainData?.logins?.total_login_days ?? 0}
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
            {!!offChainData?.commissions && (
              <>
                <div style={styles.divider} />
                <div style={styles.small}>
                  Commission estimate — L1: {offChainData.commissions.percentages.l1}% • L2:{' '}
                  {offChainData.commissions.percentages.l2}% • L3:{' '}
                  {offChainData.commissions.percentages.l3}%
                </div>
              </>
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

          {(onChainData?.role === 'admin' || onChainData?.role === 'owner') && <AdminPanel />}
        </div>
      </div>
    </div>
  )
}

const MiningStats: React.FC<{ account: string | null }> = ({ account }) => {
  const { data: miningStats } = useQuery<{ count: number; totalDeposited: string }>({
    queryKey: ['miningStats', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return { count: 0, totalDeposited: '0.00' }
      return getUserMiningStats(account!)
    },
  })
  const safeMoney = (val?: string) => {
    const n = parseFloat(val || '0')
    if (isNaN(n)) return '0.00'
    return n.toFixed(2)
  }
  return (
    <div style={{ ...styles.small, marginTop: 6 }}>
      Your Mining Stats: Miners <strong>{miningStats?.count ?? 0}</strong> • Total Deposited{' '}
      <strong>${safeMoney(miningStats?.totalDeposited)}</strong>
    </div>
  )
}

// ----------------- Admin Panel with Image/Text/Script options -----------------
const AdminPanel: React.FC = () => {
  const { account } = useWallet()
  const queryClient = useQueryClient()
  const [isProcessing, setIsProcessing] = useState(false)

  type NoticeType = 'image' | 'text' | 'script'
  const [noticeType, setNoticeType] = useState<NoticeType>('image')

  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<number>(0)
  const [isActive, setIsActive] = useState<boolean>(true)

  // Image fields
  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imagePreview, setImagePreview] = useState<string>('')

  // Text/script fields
  const [textContent, setTextContent] = useState('')
  const [scriptContent, setScriptContent] = useState('')

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
      setImagePreview(dataUrl)
      setImageUrl(dataUrl) // Store as data URL; optional: later move to CDN
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

  const postNotice = async () => {
    if (!account) return

    // Build payload according to type
    let payload: any = {
      address: account,
      title: title.trim(),
      is_active: isActive,
      priority,
      kind: noticeType,
    }

    if (noticeType === 'image') {
      if (!imageUrl) {
        showErrorToast('Please provide an image (upload or URL)')
        return
      }
      payload.image_url = imageUrl
      payload.link_url = linkUrl || ''
      payload.content_html = '' // not used for image
    } else if (noticeType === 'text') {
      if (!textContent.trim()) {
        showErrorToast('Please write some text')
        return
      }
      payload.image_url = ''
      payload.link_url = ''
      payload.content_html = textContent // plain text/HTML
    } else {
      if (!scriptContent.trim()) {
        showErrorToast('Please add script content')
        return
      }
      payload.image_url = ''
      payload.link_url = ''
      payload.content_html = wrapScriptIfNeeded(scriptContent)
    }

    setIsProcessing(true)
    try {
      const { timestamp, signature } = await signAdminAction('create_notice', account)
      await api.post('/api/notices', { ...payload, timestamp, signature })
      showSuccessToast('Notice posted')

      queryClient.invalidateQueries({ queryKey: ['offChainData', account] })

      // reset form
      setTitle('')
      setPriority(0)
      setIsActive(true)
      setImageUrl('')
      setLinkUrl('')
      setImagePreview('')
      setTextContent('')
      setScriptContent('')
    } catch (e) {
      showErrorToast(e, 'Failed to post notice')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>Admin Panel</h3>

      {/* Type switch */}
      <div style={styles.tabRow as any}>
        <button
          style={{ ...styles.tabBtn, ...(noticeType === 'image' ? styles.tabBtnActive : {}) }}
          onClick={() => setNoticeType('image')}
        >
          Image
        </button>
        <button
          style={{ ...styles.tabBtn, ...(noticeType === 'text' ? styles.tabBtnActive : {}) }}
          onClick={() => setNoticeType('text')}
        >
          Text
        </button>
        <button
          style={{ ...styles.tabBtn, ...(noticeType === 'script' ? styles.tabBtnActive : {}) }}
          onClick={() => setNoticeType('script')}
        >
          Script
        </button>
      </div>

      {/* Common fields */}
      <div style={{ ...styles.row, marginTop: 8 }}>
        <div>
          <div style={{ ...styles.small, marginBottom: 4 }}>Title</div>
          <input
            style={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter title"
          />
        </div>
        <div>
          <div style={{ ...styles.small, marginBottom: 4 }}>Priority</div>
          <input
            type="number"
            style={styles.input}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Image mode */}
      {noticeType === 'image' && (
        <>
          <div style={styles.row}>
            <div>
              <div style={{ ...styles.small, marginBottom: 4 }}>Upload from gallery</div>
              <input type="file" accept="image/*" onChange={(e) => onPickImage(e.target.files?.[0] || null)} />
              {imagePreview && (
                <div style={{ marginTop: 8 }}>
                  <img src={imagePreview} alt="preview" style={styles.previewImg as any} />
                </div>
              )}
            </div>
            <div>
              <div style={{ ...styles.small, marginBottom: 4 }}>Or Image URL</div>
              <input
                style={styles.input}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div style={{ marginTop: 6 }}>
            <div style={{ ...styles.small, marginBottom: 4 }}>Link URL (optional)</div>
            <input
              style={styles.input}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://... (opens on image click)"
            />
          </div>
        </>
      )}

      {/* Text mode */}
      {noticeType === 'text' && (
        <div style={{ marginTop: 6 }}>
          <div style={{ ...styles.small, marginBottom: 4 }}>Text content (plain text or simple HTML)</div>
          <textarea
            style={styles.textarea as any}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="<p>Your message here</p>"
          />
        </div>
      )}

      {/* Script mode */}
      {noticeType === 'script' && (
        <div style={{ marginTop: 6 }}>
          <div style={{ ...styles.small, marginBottom: 4 }}>
            Script content (you can paste raw JS; we’ll auto wrap with &lt;script&gt; if missing)
          </div>
          <textarea
            style={styles.textarea as any}
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            placeholder={`console.log('Hello from notice script');`}
          />
        </div>
      )}

      {/* Active + Post */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <button style={styles.button} onClick={postNotice} disabled={isProcessing}>
          Post Notice
        </button>
      </div>

      <div style={{ ...styles.small, ...styles.muted, marginTop: 6 }}>
        Note: Uploaded image is stored as data URL in DB for now. For production, consider a CDN
        (Cloudflare Images/R2) and use the Image URL field.
      </div>
    </div>
  )
}

export default Dashboard
