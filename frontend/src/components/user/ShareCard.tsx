import React from 'react'
import Surface from '../common/Surface'
import { showSuccessToast, showErrorToast } from '../../utils/notification'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  cardTitle: { margin: '0 0 6px 0', fontSize: 16, fontWeight: 900 },
  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },
  button: {
    height: 44, borderRadius: 10,
    background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`,
    color: '#0b1b3b', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px',
    boxShadow: '0 4px 15px rgba(20,184,166,0.3)',
  },
  small: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  row: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' },
}

type Props = {
  referralCode: string
  referralLink?: string
  title?: string
}

function copy(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
      showSuccessToast('Copied to clipboard')
      return
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    showSuccessToast('Copied to clipboard')
  } catch (e) {
    showErrorToast(e, 'Copy failed')
  }
}

const ShareCard: React.FC<Props> = ({ referralCode, referralLink, title = 'Share & Earn' }) => {
  const link = referralLink || `${window.location.origin}/register?ref=${(referralCode || '').toUpperCase()}`
  return (
    <Surface>
      <h3 style={styles.cardTitle}>{title}</h3>

      <div style={{ marginBottom: 8 }}>
        <div style={styles.small}>Referral Code</div>
        <div style={styles.row}>
          <input style={styles.input} readOnly value={referralCode || ''} />
          <button style={styles.button} onClick={() => copy(referralCode || '')}>Copy</button>
        </div>
      </div>

      <div>
        <div style={styles.small}>Referral Link</div>
        <div style={styles.row}>
          <input style={styles.input} readOnly value={link} />
          <button style={styles.button} onClick={() => copy(link)}>Copy</button>
        </div>
      </div>
    </Surface>
  )
}

export default ShareCard
