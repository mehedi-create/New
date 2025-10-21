import React, { useEffect } from 'react'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: 12,
  },
  card: {
    minWidth: 300,
    maxWidth: 460,
    padding: 18,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #0b1b3b 0%, #163057 100%)',
    color: colors.text,
    border: `1px solid ${colors.grayLine}`,
    boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
    textAlign: 'center' as const,
  },
  spinner: {
    width: 26,
    height: 26,
    margin: '0 auto 8px',
    border: '3px solid rgba(255,255,255,0.2)',
    borderTopColor: colors.accent,
    borderRadius: '50%',
    animation: 'lxr-spin 0.8s linear infinite',
  },
  title: { fontWeight: 800, marginBottom: 4 },
  message: { fontSize: '0.95rem', color: colors.textMuted },
  note: { marginTop: 6, fontSize: 12, color: colors.textMuted },
  actions: { marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' },
  btn: {
    height: 40,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    color: colors.text,
    border: `1px solid ${colors.grayLine}`,
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    padding: '0 12px',
  },
}

function ensureKeyframes() {
  const id = 'lxr-kf-spin'
  if (typeof document === 'undefined') return
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.innerHTML = `@keyframes lxr-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`
  document.head.appendChild(style)
}

type ProcessingOverlayProps = {
  open: boolean
  title?: string
  message?: string
  note?: string
  cancelText?: string
  onCancel?: () => void
  showCancel?: boolean
}

const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  open,
  title = 'Processing',
  message = '',
  note,
  cancelText = 'Cancel',
  onCancel,
  showCancel = false,
}) => {
  useEffect(() => { ensureKeyframes() }, [])
  if (!open) return null

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <div style={styles.title}>{title}</div>
        {!!message && <div style={styles.message}>{message}</div>}
        {!!note && <div style={styles.note}>{note}</div>}
        {showCancel && onCancel && (
          <div style={styles.actions}>
            <button style={styles.btn} onClick={onCancel}>{cancelText}</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProcessingOverlay
