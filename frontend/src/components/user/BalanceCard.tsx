import React, { useState } from 'react'
import Surface from '../common/Surface'
import ProcessingOverlay from '../common/ProcessingOverlay'
import { withdrawWithFundCode } from '../../utils/contract'
import { showErrorToast, showSuccessToast } from '../../utils/notification'

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
  danger: '#ef4444',
}

const styles: Record<string, React.CSSProperties> = {
  balance: { fontSize: 26, fontWeight: 900, margin: '4px 0 6px' },
  small: { fontSize: 12, color: colors.textMuted },
  button: {
    height: 44, borderRadius: 10,
    background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`,
    color: '#0b1b3b', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', width: '100%',
    boxShadow: '0 4px 15px rgba(20,184,166,0.3)',
  },
  buttonGhost: {
    height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`,
    fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px', width: '100%',
  },
  buttonDisabled: { opacity: 0.65, cursor: 'not-allowed' },
  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },

  // Simple modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12,
  },
  modal: {
    maxWidth: 420, width: '100%', borderRadius: 14,
    background: 'linear-gradient(135deg, #0b1b3b 0%, #163057 100%)',
    border: `1px solid ${colors.grayLine}`,
    color: colors.text, padding: 14,
  },
  dangerText: { fontSize: 12, color: colors.danger, fontWeight: 800, marginTop: 6 },
}

type Props = {
  balanceLabel: string // e.g. "$123.45"
  hasFundCode: boolean
  onSuccess?: () => Promise<void> | void
  disabled?: boolean
}

const BalanceCard: React.FC<Props> = ({ balanceLabel, hasFundCode, onSuccess, disabled }) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [showFundModal, setShowFundModal] = useState(false)
  const [fundCode, setFundCode] = useState('')
  const [fundErr, setFundErr] = useState<string>('')

  const openFundModal = () => {
    if (!hasFundCode) {
      showErrorToast('Fund code not set. Please register with a fund code.')
      return
    }
    setFundErr('')
    setFundCode('')
    setShowFundModal(true)
  }

  const confirmWithdraw = async () => {
    if (!fundCode) { setFundErr('Please enter your Fund Code'); return }
    setFundErr('')
    setIsProcessing(true)
    try {
      const tx = await withdrawWithFundCode(fundCode)
      // @ts-ignore
      if (tx?.wait) await tx.wait()
      setShowFundModal(false)
      setFundCode('')
      showSuccessToast('Payout successful!')
      if (onSuccess) await onSuccess()
    } catch (e) {
      setFundErr(typeof (e as any)?.message === 'string' ? (e as any).message : 'Payout failed')
      showErrorToast(e, 'Payout failed')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <ProcessingOverlay open={isProcessing} message="Processing your payout..." />

      <Surface>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 900 }}>Available Balance</h3>
        <div style={styles.balance}>{balanceLabel}</div>
        <button
          style={{ ...styles.button, ...(disabled ? styles.buttonDisabled : {}) }}
          disabled={disabled}
          onClick={openFundModal}
        >
          Payout
        </button>
        {!hasFundCode && (
          <div style={{ ...styles.small, color: colors.danger, marginTop: 8 }}>
            Fund code not set. You must register with a fund code to withdraw.
          </div>
        )}
      </Surface>

      {showFundModal && (
        <div style={styles.overlay} onClick={() => (!isProcessing ? setShowFundModal(false) : null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Enter Fund Code</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>
              Your secret Fund Code is required to withdraw your on‑chain balance.
            </div>
            <input
              type="password"
              placeholder="••••"
              value={fundCode}
              onChange={(e) => setFundCode(e.target.value)}
              style={styles.input}
              disabled={isProcessing}
            />
            {!!fundErr && <div style={styles.dangerText}>{fundErr}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="lxr-buy-btn" onClick={confirmWithdraw} disabled={isProcessing}>
                {isProcessing ? 'PROCESSING...' : 'Withdraw'}
              </button>
              <button
                style={{ ...styles.buttonGhost, ...(isProcessing ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                onClick={() => setShowFundModal(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default BalanceCard
