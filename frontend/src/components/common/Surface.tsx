import React from 'react'

type Props = {
  children: React.ReactNode
  style?: React.CSSProperties
  title?: string
  sub?: React.ReactNode
}

const small: React.CSSProperties = { fontSize: 12, color: 'rgba(232,249,241,0.75)' }

const Surface: React.FC<Props> = ({ children, style, title, sub }) => {
  return (
    <div className="lxr-surface" style={style}>
      <div className="lxr-surface-lines" />
      <div className="lxr-surface-mesh" />
      <div className="lxr-surface-circuit" />
      <div className="lxr-surface-holo" />
      <div style={{ position: 'relative', zIndex: 2 }}>
        {title && (
          <div style={{ fontWeight: 900, marginBottom: 6 }}>
            {title} {sub && <span style={{ ...small, marginLeft: 6 }}>{sub}</span>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export default Surface
