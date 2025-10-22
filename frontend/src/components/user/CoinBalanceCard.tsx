import React, { useState } from 'react'
import Surface from '../common/Surface'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  accent: '#14b8a6',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { margin: '0 0 6px 0', fontSize: 16, fontWeight: 900 },
  infoBtn: {
    height: 32, width: 32, borderRadius: 8,
    background: 'rgba(255,255,255,0.06)', color: colors.text,
    border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center',
    cursor: 'pointer', transition: 'box-shadow .15s ease, transform .15s ease, opacity .2s ease',
  },
  infoBtnHover: {
    boxShadow: '0 0 0 4px rgba(20,184,166,0.25)', transform: 'translateY(-1px)',
  },
  balance: { fontSize: 26, fontWeight: 900, margin: '4px 0 10px' },
  btnGhostDisabled: {
    height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.08)',
    color: colors.textMuted, border: `1px solid ${colors.grayLine}`,
    fontSize: 14, fontWeight: 800, cursor: 'not-allowed', padding: '0 12px', width: '100%',
    opacity: 0.6,
  },
}

type Props = {
  coinBalance: number | string
  onInfo?: () => void
}

const InfoIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <line x1="12" y1="10" x2="12" y2="16" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="7" r="1.6" fill="currentColor" />
  </svg>
)

const CoinBalanceCard: React.FC<Props> = ({ coinBalance, onInfo }) => {
  const [hover, setHover] = useState(false)
  const value = Number(coinBalance || 0)
  const text = isFinite(value) ? value.toFixed(2) : '0.00'

  return (
    <Surface>
      <div style={styles.titleRow}>
        <h3 style={styles.title}>Total Coin Balance</h3>
        {onInfo && (
          <button
            type="button"
            title="How to earn coins"
            aria-label="How to earn coins"
            style={{ ...styles.infoBtn, ...(hover ? styles.infoBtnHover : {}) }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={onInfo}
          >
            <InfoIcon />
          </button>
        )}
      </div>
      <div style={styles.balance}>{text}</div>
      <button style={styles.btnGhostDisabled} disabled>
        Withdraw (Coming Soon)
      </button>
    </Surface>
  )
}

export default CoinBalanceCard
