import React, { useMemo, useState } from 'react'
import Surface from '../common/Surface'
import { isValidAddress } from '../../utils/wallet'
import { getAdminUserInfo, type AdminUserInfo } from '../../services/api'
import { showErrorToast } from '../../utils/notification'
import UserDetailModal from './UserDetailModal'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
}

const styles: Record<string, React.CSSProperties> = {
  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' },
  small: { fontSize: 12, color: colors.textMuted },
  uidBtn: {
    border: 'none', background: 'transparent', color: colors.accent, fontWeight: 900, cursor: 'pointer',
    textDecoration: 'underline', padding: 0, fontSize: 14,
  },
}

async function signAdminAction(purpose: 'user_info', adminAddress: string) {
  const { ethers, BrowserProvider } = await import('ethers')
  const provider = new BrowserProvider((window as any).ethereum)
  const signer = await provider.getSigner()
  const ts = Math.floor(Date.now() / 1000)
  const message = `Admin action authorization
Purpose: ${purpose}
Address: ${ethers.getAddress(adminAddress)}
Timestamp: ${ts}`
  const signature = await signer.signMessage(message)
  return { timestamp: ts, signature }
}

type Props = {
  allow: boolean
  adminAddress: string
}

const UserToolsCard: React.FC<Props> = ({ allow, adminAddress }) => {
  const [query, setQuery] = useState('')
  const canSearch = useMemo(() => {
    const q = query.trim()
    return q.length >= 4 // ছোট ইউআইডি/টাইপো ফিল্টার
  }, [query])

  const [loading, setLoading] = useState(false)
  const [found, setFound] = useState<AdminUserInfo['user'] | null>(null)

  // Details modal state
  const [openDetail, setOpenDetail] = useState(false)

  const onSearch = async () => {
    if (!allow) { showErrorToast('Not allowed'); return }
    if (!adminAddress) { showErrorToast('Connect admin wallet'); return }
    if (!canSearch) { showErrorToast('Enter UID or Wallet'); return }

    setLoading(true)
    setFound(null)
    try {
      const { timestamp, signature } = await signAdminAction('user_info', adminAddress)
      const q = query.trim()
      const payload: any = { address: adminAddress, timestamp, signature }
      if (isValidAddress(q)) payload.wallet = q.toLowerCase()
      else payload.user_id = q.toUpperCase()

      const res = await getAdminUserInfo(payload)
      if (!res.data?.ok || !res.data?.user) {
        showErrorToast('User not found')
        return
      }
      setFound(res.data.user)
    } catch (e) {
      showErrorToast(e, 'Failed to fetch user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Surface title="User Tools" sub="Search by UID or Wallet">
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Single search input */}
          <div style={styles.row}>
            <input
              style={styles.input}
              placeholder="Enter UID or 0x... wallet"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch() }}
            />
            <button className="lxr-buy-btn" onClick={onSearch} disabled={!allow || loading || !adminAddress || !canSearch}>
              {loading ? 'SEARCHING...' : 'Search'}
            </button>
          </div>
          <div style={styles.small}>Tip: You can paste a wallet or type a user ID. Click result UID to open full details.</div>

          {/* Result preview */}
          {!found ? (
            <div style={styles.small}>No user selected</div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>Result:</div>
              <button
                style={styles.uidBtn}
                onClick={() => setOpenDetail(true)}
                title="Open details"
              >
                {found.user_id} (click to open)
              </button>
              <div style={styles.small} title={found.wallet_address}>• {found.wallet_address}</div>
            </div>
          )}
        </div>
      </Surface>

      {/* Details modal */}
      <UserDetailModal
        open={openDetail}
        onClose={() => setOpenDetail(false)}
        adminAddress={adminAddress}
        allow={allow}
        // Pass either wallet or uid; modal will refresh itself
        initialUser={found || undefined}
      />
    </>
  )
}

export default UserToolsCard
