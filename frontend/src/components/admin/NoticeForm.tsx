
import React, { useState } from 'react'
import Surface from '../common/Surface'
import { createNotice } from '../../services/api'
import { showErrorToast, showSuccessToast } from '../../utils/notification'
import { ethers, BrowserProvider } from 'ethers'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  tabs: { display: 'flex', gap: 8, marginBottom: 8 },
  tabBtn: {
    height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)',
    color: colors.text, border: `1px solid ${colors.grayLine}`, fontWeight: 800, padding: '0 12px', cursor: 'pointer',
  },
  tabActive: { borderColor: colors.accent },
  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },
  textarea: {
    minHeight: 120, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: 10, background: 'rgba(255,255,255,0.05)', color: colors.text, fontFamily: 'monospace', fontSize: 13,
  },
  small: { fontSize: 12, color: colors.textMuted },
}

async function signAdminAction(purpose: 'create_notice', adminAddress: string) {
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
  onPosted?: () => void
}

const NoticeForm: React.FC<Props> = ({ adminAddress, onPosted }) => {
  type Tab = 'image' | 'script'
  const [tab, setTab] = useState<Tab>('image')

  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [scriptContent, setScriptContent] = useState('')

  const [expireMinutes, setExpireMinutes] = useState<string>('') // blank = keep
  const [isPosting, setIsPosting] = useState(false)

  const minutesToSeconds = (mStr: string) => {
    const m = Number(mStr || '0')
    return Number.isFinite(m) && m > 0 ? Math.round(m * 60) : undefined
  }

  const onPost = async () => {
    if (!adminAddress) { showErrorToast('Connect owner/admin wallet'); return }
    try {
      setIsPosting(true)
      const { timestamp, signature } = await signAdminAction('create_notice', adminAddress)
      const expires_in_sec = minutesToSeconds(expireMinutes)

      if (tab === 'image') {
        if (!imageUrl.trim()) { showErrorToast('Please provide image URL'); return }
        await createNotice({
          address: adminAddress,
          timestamp, signature,
          kind: 'image',
          image_url: imageUrl.trim(),
          link_url: (linkUrl || '').trim(),
          is_active: true,
          priority: 0,
          ...(expires_in_sec ? { expires_in_sec } : {}),
        })
      } else {
        if (!scriptContent.trim()) { showErrorToast('Please provide script content'); return }
        await createNotice({
          address: adminAddress,
          timestamp, signature,
          kind: 'script',
          content_html: scriptContent,
          is_active: true,
          priority: 0,
          ...(expires_in_sec ? { expires_in_sec } : {}),
        })
      }

      showSuccessToast('Notice posted')
      setImageUrl(''); setLinkUrl(''); setScriptContent(''); setExpireMinutes('')
      if (onPosted) onPosted()
    } catch (e) {
      showErrorToast(e, 'Failed to post notice')
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <Surface title="Post Notice" sub="Image or Script • optional expiry (minutes)">
      <div style={styles.tabs}>
        <button style={{ ...styles.tabBtn, ...(tab === 'image' ? styles.tabActive : {}) }} onClick={() => setTab('image')}>Image</button>
        <button style={{ ...styles.tabBtn, ...(tab === 'script' ? styles.tabActive : {}) }} onClick={() => setTab('script')}>Script</button>
      </div>

      {tab === 'image' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <div>
            <div style={{ ...styles.small, marginBottom: 4 }}>Image URL</div>
            <input style={styles.input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <div style={{ ...styles.small, marginBottom: 4 }}>Link URL (open on click)</div>
            <input style={styles.input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <div style={{ ...styles.small, marginBottom: 4 }}>Expires in (minutes) — leave blank to keep</div>
            <input style={styles.input} value={expireMinutes} onChange={(e) => setExpireMinutes(e.target.value)} placeholder="e.g., 60" />
          </div>
          <div>
            <button className="lxr-buy-btn" onClick={onPost} disabled={isPosting}>
              {isPosting ? 'POSTING...' : 'Post Image Notice'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <div>
            <div style={{ ...styles.small, marginBottom: 4 }}>Script content</div>
            <textarea
              style={styles.textarea}
              value={scriptContent}
              onChange={(e) => setScriptContent(e.target.value)}
              placeholder={`console.log('Hello');`}
            />
          </div>
          <div>
            <div style={{ ...styles.small, marginBottom: 4 }}>Expires in (minutes) — leave blank to keep</div>
            <input style={styles.input} value={expireMinutes} onChange={(e) => setExpireMinutes(e.target.value)} placeholder="e.g., 120" />
          </div>
          <div>
            <button className="lxr-buy-btn" onClick={onPost} disabled={isPosting}>
              {isPosting ? 'POSTING...' : 'Post Script Notice'}
            </button>
          </div>
        </div>
      )}
    </Surface>
  )
}

export default NoticeForm
