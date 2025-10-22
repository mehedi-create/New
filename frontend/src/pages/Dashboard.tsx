import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '../context/WalletContext'
import {
  getUserBalance,
  hasSetFundCode,
  getRegistrationFee,
  isRegistered,
  signAuthMessage,
} from '../utils/contract'
import { getStats, upsertUserFromChain, type StatsResponse } from '../services/api'
import { isValidAddress } from '../utils/wallet'
import NoticeCarousel from '../components/NoticeCarousel'

import Surface from '../components/common/Surface'
import BottomNav from '../components/common/BottomNav'
import BalanceCard from '../components/user/BalanceCard'
import CoinBalanceCard from '../components/user/CoinBalanceCard'
import MiningCard from '../components/mining/MiningCard'
import MinerHistoryModal from '../components/mining/MinerHistoryModal'
import StatsAndLoginCard from '../components/user/StatsAndLoginCard'
import ShareCard from '../components/user/ShareCard'

type OnChainData = {
  userBalance: string
  hasFundCode: boolean
  registrationFee: string
}

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
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

  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'stretch' },
  cardShell: { background: 'transparent', border: 'none', padding: 0 },

  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontWeight: 900, fontSize: 13 },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontSize: 13 },
}

const setTabCookie = (value: 'home' | 'mining') => {
  try {
    const v = encodeURIComponent(value)
    const maxAge = 365 * 24 * 60 * 60
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `activeTab=${v}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
  } catch {}
}
const getTabCookie = (): 'home' | 'mining' => {
  try {
    const key = `${encodeURIComponent('activeTab')}=`
    const found = document.cookie.split('; ').find(p => p.startsWith(key))
    const val = found ? decodeURIComponent(found.substring(key.length)) : ''
    return val === 'mining' ? 'mining' : 'home'
  } catch { return 'home' }
}

const safeMoney = (val?: string) => { const n = parseFloat(val || '0'); return isNaN(n) ? '0.00' : n.toFixed(2) }

const Dashboard: React.FC = () => {
  const { account, userId, disconnect } = useWallet()
  const queryClient = useQueryClient()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey)
    }
  }, [])

  const [activeTab, setActiveTab] = useState<'home' | 'mining'>(getTabCookie())
  useEffect(() => { setTabCookie(activeTab) }, [activeTab])

  const { data: onChainData } = useQuery<OnChainData | null>({
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

  const { data: stats } = useQuery<StatsResponse | null>({
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

  useEffect(() => {
    if (!isValidAddress(account)) return
    const run = async () => {
      try {
        const registered = await isRegistered(account!)
        if (!registered) return
        let exists = false
        try {
          const res = await getStats(account!)
          exists = !!res?.data?.userId
        } catch (err: any) {
          const status = err?.response?.status || err?.status
          if (status !== 404) return
        }
        if (!exists) {
          const { timestamp, signature } = await signAuthMessage(account!)
          await upsertUserFromChain(account!, timestamp, signature)
          queryClient.invalidateQueries({ queryKey: ['stats-lite', account] })
        }
      } catch {}
    }
    run()
  }, [account, queryClient])

  const [showHistory, setShowHistory] = useState(false)
  const [showCoinInfo, setShowCoinInfo] = useState(false)

  const CoinInfoModal = () => {
    if (!showCoinInfo) return null
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12,
      }} onClick={() => setShowCoinInfo(false)}>
        <div className="lxr-surface" style={{ maxWidth: 520, width: '100%' }} onClick={(e) => e.stopPropagation()}>
          <div className="lxr-surface-lines" />
          <div className="lxr-surface-mesh" />
          <div className="lxr-surface-circuit" />
          <div className="lxr-surface-holo" />
          <div style={{ position: 'relative', zIndex: 2, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 900 }}>How to earn coins</div>
              <button
                style={{
                  height: 32, width: 32, borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)', color: colors.text,
                  border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center', cursor: 'pointer'
                }}
                onClick={() => setShowCoinInfo(false)}
                aria-label="Close"
              >
                ✕
              </button>
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
              <button className="lxr-buy-btn" onClick={() => setShowCoinInfo(false)}>Got it</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderHome = () => (
    <div style={styles.grid}>
      <BalanceCard
        balanceLabel={`$${safeMoney(onChainData?.userBalance)}`}
        hasFundCode={!!onChainData?.hasFundCode}
      />

      <div style={styles.cardShell}>
        <NoticeCarousel autoIntervalMs={5000} limit={10} />
      </div>

      <ShareCard
        referralCode={(userId || '').toUpperCase()}
        referralLink={`${window.location.origin}/register?ref=${(userId || '').toUpperCase()}`}
      />
    </div>
  )

  const renderMining = () => (
    <div style={styles.grid}>
      <div style={styles.cardShell}>
        <CoinBalanceCard coinBalance={Number(stats?.coin_balance ?? 0)} onInfo={() => setShowCoinInfo(true)} />
      </div>

      {/* MiningCard: শুধু History বাটন থাকবে */}
      <div style={styles.cardShell}>
        <MiningCard
          account={account}
          minAmount={5}
          onAfterPurchase={async () => {
            queryClient.invalidateQueries({ queryKey: ['onChainData', account] })
            queryClient.invalidateQueries({ queryKey: ['stats-lite', account] })
          }}
          onShowHistory={() => setShowHistory(true)}
        />
      </div>

      <div style={styles.cardShell}>
        <StatsAndLoginCard account={account} />
      </div>
    </div>
  )

  const displayUserId = useMemo(() => (userId || stats?.userId || 'USER').toUpperCase(), [userId, stats?.userId])

  return (
    <div style={styles.page}>
      <CoinInfoModal />
      <MinerHistoryModal open={showHistory} account={account} onClose={() => setShowHistory(false)} />

      <div style={styles.container}>
        <div style={styles.topBar}>
          <div className="lxr-lexori-logo" style={styles.brand as any}>Web3 Community</div>
          <div style={styles.userMenuWrap} ref={menuRef}>
            <span style={styles.userIdText} title={displayUserId}>{displayUserId}</span>
            <button
              style={styles.userMenuBtn}
              onClick={() => setMenuOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="User menu"
            >
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

        {activeTab === 'home' ? renderHome() : renderMining()}
      </div>

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
            active: activeTab === 'mining',
            onClick: () => setActiveTab('mining'),
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
