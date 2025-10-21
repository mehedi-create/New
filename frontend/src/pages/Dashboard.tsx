import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '../context/WalletContext'
import {
  getUserBalance,
  hasSetFundCode,
  getRegistrationFee,
  getUserMiningStats,
  isRegistered,
  signAuthMessage,
} from '../utils/contract'
import { isValidAddress } from '../utils/wallet'
import NoticeCarousel from '../components/NoticeCarousel'

// Split components
import Surface from '../components/common/Surface'
import BottomNav from '../components/common/BottomNav'
import BalanceCard from '../components/user/BalanceCard'
import MiningCard from '../components/mining/MiningCard'
import MinerHistoryModal from '../components/mining/MinerHistoryModal'
import StatsAndLoginCard from '../components/user/StatsAndLoginCard'
import ShareCard from '../components/user/ShareCard'

import { ensureUserProfile, getStats, upsertUserFromChain } from '../services/api'
import { showErrorToast } from '../utils/notification'

// Theme
const colors = {
  text: '#e8f9f1',
  grayLine: 'rgba(255,255,255,0.12)',
}

// Styles
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
}

// Cookie helpers (persist tab)
const setCookie = (name: string, value: string, days = 365) => {
  try {
    const maxAge = days * 24 * 60 * 60
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
  } catch {}
}
const getCookie = (name: string): string | null => {
  try {
    const key = `${encodeURIComponent(name)}=`
    const parts = document.cookie.split('; ')
    for (const p of parts) if (p.startsWith(key)) return decodeURIComponent(p.substring(key.length))
  } catch {}
  return null
}

// Helpers
const safeMoney = (val?: string) => { const n = parseFloat(val || '0'); return isNaN(n) ? '0.00' : n.toFixed(2) }

type OnChainData = {
  userBalance: string
  hasFundCode: boolean
  registrationFee: string
}

const Dashboard: React.FC = () => {
  const { account, userId, disconnect } = useWallet()
  const queryClient = useQueryClient()

  // Top bar dropdown (light)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Tabs (persist to cookie, like before)
  const [activeTab, setActiveTabState] = useState<'home' | 'surprise'>(() => (getCookie('activeTab') === 'surprise' ? 'surprise' : 'home'))
  const setActiveTab = (t: 'home' | 'surprise') => { setActiveTabState(t); setCookie('activeTab', t, 365) }

  // On-chain quick reads
  const { data: onChainData } = useQuery<OnChainData | null>({
    queryKey: ['onChainData.v2', account],
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

  // On-chain mining stats (restore; warm the data like earlier)
  useQuery<{ count: number; totalDeposited: string }>({
    queryKey: ['miningStats', account],
    enabled: isValidAddress(account),
    refetchInterval: 60000,
    queryFn: async () => {
      if (!isValidAddress(account)) return { count: 0, totalDeposited: '0.00' }
      return getUserMiningStats(account!)
    },
  })

  // Proactive ensure off-chain profile if on-chain registered (restore)
  useEffect(() => {
    if (!isValidAddress(account)) return
    let cancelled = false
    const run = async () => {
      try {
        const registered = await isRegistered(account!)
        if (!registered) return
        // Check if stats exists
        let exists = false
        try {
          const res = await getStats(account!)
          exists = !!res?.data?.userId
        } catch (err: any) {
          const status = err?.response?.status || err?.status
          if (status !== 404) return
        }
        if (!exists) {
          // Attempt upsert
          try {
            await ensureUserProfile(account!)
            // refresh dependent queries
            queryClient.invalidateQueries({ queryKey: ['stats-lite', account] })
          } catch {}
        }
      } catch {}
    }
    run()
    return () => { cancelled = true }
  }, [account, queryClient])

  // Referral code/link
  const referralCode = useMemo(() => (userId || '').toUpperCase(), [userId])
  const referralLink = useMemo(() => `${window.location.origin}/register?ref=${referralCode}`, [referralCode])

  // Miner history modal
  const [showHistory, setShowHistory] = useState(false)

  // UI helpers
  const displayUserId = useMemo(() => (userId || 'USER').toUpperCase(), [userId])

  return (
    <div style={styles.page}>
      <MinerHistoryModal open={showHistory} account={account} onClose={() => setShowHistory(false)} />

      <div style={styles.container}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <div className="lxr-lexori-logo" style={styles.brand as any}>Web3 Community</div>
          <div style={styles.userMenuWrap} ref={menuRef}>
            <span style={styles.userIdText} title={displayUserId}>{displayUserId}</span>
            <button style={styles.userMenuBtn} onClick={() => setMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="User menu">
              <svg width={18} height={18} viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0-5-5 5.006 5.006 0 0 0 5 5zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14z" fill="currentColor"/></svg>
            </button>
            {menuOpen && (
              <div className="lxr-dropdown" role="menu" style={{ position: 'absolute', right: 0, top: 40 }}>
                <button
                  style={{ width: 140, textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800 }}
                  onClick={() => { setMenuOpen(false); disconnect() }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        {activeTab === 'home' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {/* Balance */}
            <BalanceCard
              balanceLabel={`$${safeMoney(onChainData?.userBalance)}`}
              hasFundCode={!!onChainData?.hasFundCode}
            />

            {/* Notices */}
            <div style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <NoticeCarousel autoIntervalMs={5000} limit={10} />
            </div>

            {/* Share & Earn */}
            <ShareCard referralCode={referralCode} referralLink={referralLink} />

            {/* Your Stats + Login */}
            <StatsAndLoginCard account={account} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Surface>
              <div style={{ textAlign: 'center', margin: '6px 0 10px', fontSize: 16, fontWeight: 900 }}>
                Mining
              </div>
              <MiningCard
                account={account}
                minAmount={5}
                defaultAmount={getCookie('miningAmount') || '5.00'}
                onAfterPurchase={async () => {
                  // restore: invalidate caches after buy
                  queryClient.invalidateQueries({ queryKey: ['onChainData.v2', account] })
                  queryClient.invalidateQueries({ queryKey: ['stats-lite', account] })
                  queryClient.invalidateQueries({ queryKey: ['miningStats', account] })
                }}
                onShowHistory={() => setShowHistory(true)}
              />
            </Surface>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <BottomNav
        items={[
          {
            key: 'home',
            icon: <svg width={20} height={20} viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5v8.5a2 2 0 0 1-2 2h-5v-6H10v6H5a2 2 0 0 1-2-2v-8.5z" fill="currentColor"/></svg>,
            label: 'Home',
            active: activeTab === 'home',
            onClick: () => setActiveTab('home'),
          },
          {
            key: 'mining',
            icon: <svg width={20} height={20} viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
            label: 'Mining',
            active: activeTab === 'surprise',
            onClick: () => setActiveTab('surprise'),
          },
        ]}
        columns={2}
        fixed
        maxWidth={680}
      />
    </div>
  )
}

export default Dashboard
