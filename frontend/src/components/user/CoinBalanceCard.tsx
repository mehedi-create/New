import React from 'react'
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
    border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center', cursor: 'pointer',
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

const CoinBalanceCard: React.FC<Props> = ({ coinBalance, onInfo }) => {
  const value = Number(coinBalance || 0)
  const text = isFinite(value) ? value.toFixed(2) : '0.00'

  return (
    <Surface>
      <div style={styles.titleRow}>
        <h3 style={styles.title}>Total Coin Balance</h3>
        {onInfo && (
          <button
            title="How to earn coins"
            aria-label="How to earn coins"
            style={styles.infoBtn}
            onClick={onInfo}
          >
            i
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
