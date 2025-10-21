import React from 'react'

const colors = {
  text: '#e8f9f1',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  wrapFixed: { position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: '100%', padding: '0 12px', zIndex: 200 },
  surfacePad: { padding: 8, borderRadius: 14 },
  row: { display: 'grid', gap: 8 },
  btn: {
    height: 48,
    borderRadius: 12,
    border: `1px solid ${colors.grayLine}`,
    background: 'rgba(255,255,255,0.06)',
    fontWeight: 800,
    cursor: 'pointer',
    color: colors.text,
    display: 'grid',
    placeItems: 'center',
  },
  btnActive: {
    background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`,
    color: '#0b1b3b',
    borderColor: colors.accent,
  },
  label: { fontSize: 11, fontWeight: 800, marginTop: 2 },
}

// helper function (type-safe)
const innerMax = (maxWidth: number): React.CSSProperties => ({
  maxWidth,
  margin: '0 auto',
})

export type BottomNavItem = {
  key: string
  icon?: React.ReactNode
  label?: string
  ariaLabel?: string
  active?: boolean
  onClick?: () => void
  title?: string
}

type Props = {
  items: BottomNavItem[]
  columns?: number // default items.length
  fixed?: boolean  // default true
  maxWidth?: number // default 880
  className?: string
}

const BottomNav: React.FC<Props> = ({ items, columns, fixed = true, maxWidth = 880, className }) => {
  const cols = columns || Math.max(1, items.length)
  return (
    <div style={fixed ? styles.wrapFixed : undefined} className={className}>
      <div className="lxr-surface" style={{ ...styles.surfacePad, ...(fixed ? innerMax(maxWidth) : {}) }}>
        <div className="lxr-surface-lines" />
        <div className="lxr-surface-mesh" />
        <div className="lxr-surface-circuit" />
        <div className="lxr-surface-holo" />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ ...styles.row, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {items.map((it) => (
              <button
                key={it.key}
                style={{ ...styles.btn, ...(it.active ? styles.btnActive : {}) }}
                onClick={it.onClick}
                title={it.title || it.label || it.ariaLabel}
                aria-label={it.ariaLabel || it.label || it.title}
              >
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  {it.icon}
                  {it.label ? <div style={styles.label}>{it.label}</div> : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BottomNav
