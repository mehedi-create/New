import React from 'react'
import Surface from '../common/Surface'
import { useQuery } from '@tanstack/react-query'
import {
  getAdminNotices,
  updateNotice,
  deleteNotice,
  type AdminNotice,
} from '../../services/api'
import { showErrorToast, showSuccessToast } from '../../utils/notification'
import { ethers, BrowserProvider } from 'ethers'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
  danger: '#b91c1c',
}

const styles: Record<string, React.CSSProperties> = {
  small: { fontSize: 12, color: colors.textMuted },
  table: { width: '100%', borderCollapse: 'collapse' as const, color: colors.text },
  th: { textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontWeight: 900, fontSize: 13 },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, fontSize: 13 },
  input: {
    height: 36, borderRadius: 8, border: '2px solid rgba(20,184,166,0.3)', padding: '0 8px',
    background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, width: 100,
  },
  btn: {
    height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', padding: '0 10px', fontWeight: 800,
    background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`, color: '#0b1b3b',
  },
  btnDanger: {
    height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', padding: '0 10px', fontWeight: 800,
    background: colors.danger, color: '#fff',
  },
  actions: { display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
}

async function signAdminAction(purpose: 'update_notice' | 'delete_notice', adminAddress: string) {
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
  adminAddress: string
  allow?: boolean
  limit?: number
  onChanged?: () => void
}

const NoticeList: React.FC<Props> = ({ adminAddress, allow = true, limit = 150, onChanged }) => {
  const { data: list = [], isFetching, refetch } = useQuery<AdminNotice[]>({
    queryKey: ['adminNotices', limit],
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await getAdminNotices(limit)
      return res.data.notices || []
    },
  })

  const setExpiry = async (id: number, minutes: number) => {
    if (!allow) return
    if (!(minutes > 0)) { showErrorToast('Enter minutes > 0'); return }
    try {
      const { timestamp, signature } = await signAdminAction('update_notice', adminAddress)
      await updateNotice(id, { address: adminAddress, timestamp, signature, expires_in_sec: Math.round(minutes * 60) })
      showSuccessToast('Expiry set')
      await refetch()
      if (onChanged) onChanged()
    } catch (e) {
      showErrorToast(e, 'Failed to set expiry')
    }
  }

  const del = async (id: number) => {
    if (!allow) return
    if (!window.confirm('Delete this notice?')) return
    try {
      const { timestamp, signature } = await signAdminAction('delete_notice', adminAddress)
      await deleteNotice(id, { address: adminAddress, timestamp, signature })
      showSuccessToast('Deleted')
      await refetch()
      if (onChanged) onChanged()
    } catch (e) {
      showErrorToast(e, 'Failed to delete')
    }
  }

  return (
    <Surface title="Manage Notices" sub={isFetching ? 'Refreshing…' : `Total: ${list.length}`}>
      <div style={styles.topRow}>
        <div />
        <button className="lxr-buy-btn" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'LOADING...' : 'Refresh'}
        </button>
      </div>

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
            {(list || []).length === 0 ? (
              <tr><td colSpan={6} style={{ ...styles.td, color: colors.textMuted }}>No notices</td></tr>
            ) : (list || []).map((n) => {
              const isExpired = !!n.expires_at && new Date(n.expires_at).getTime() <= Date.now()
              const statusText = isExpired ? 'Expired' : (n.is_active ? 'Active' : 'Inactive')
              const expires = n.expires_at ? new Date(n.expires_at).toLocaleString() : '—'
              const preview = n.kind === 'image' ? (n.image_url || '').slice(0, 32) : (n.content_html || '').slice(0, 32)

              // Local minute input (uncontrolled simple)
              let minsInput: HTMLInputElement | null = null

              return (
                <tr key={n.id}>
                  <td style={styles.td}>{n.id}</td>
                  <td style={styles.td}>{n.kind}</td>
                  <td style={styles.td}>
                    <span style={{ color: isExpired ? colors.textMuted : colors.accent, fontWeight: 800 }}>{statusText}</span>
                  </td>
                  <td style={styles.td} title={n.kind === 'image' ? (n.image_url || '') : ''}>
                    {preview || '—'}
                  </td>
                  <td style={styles.td}>{expires}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <div style={styles.actions}>
                      <input
                        ref={(r) => (minsInput = r)}
                        style={styles.input}
                        placeholder="mins"
                        inputMode="numeric"
                      />
                      <button
                        style={styles.btn}
                        onClick={() => {
                          const v = Number(minsInput?.value || '0')
                          setExpiry(n.id, v)
                          if (minsInput) minsInput.value = ''
                        }}
                      >
                        Set expiry
                      </button>
                      <button style={styles.btnDanger} onClick={() => del(n.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Surface>
  )
}

export default NoticeList
