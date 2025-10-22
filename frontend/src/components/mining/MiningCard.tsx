import React, { useState } from 'react'
import { BrowserProvider, Contract, parseUnits } from 'ethers'
import ProcessingOverlay from '../common/ProcessingOverlay'
import { approveUSDT, buyMiner } from '../../utils/contract'
import { recordMiningPurchaseLite } from '../../services/api'
import { config } from '../../config'
import { showErrorToast, showSuccessToast } from '../../utils/notification'

const colors = {
  accent: '#14b8a6',
  accent2: '#0ea5a5',
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  cardShell: { background: 'transparent', border: 'none', padding: 0 },
  panel: { display: 'flex', gap: 10, alignItems: 'flex-end' },
  input: {
    height: 44, borderRadius: 12, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 12px', background: 'rgba(255,255,255,0.06)', outline: 'none', color: colors.text, fontSize: 15, width: '100%',
  },
  label: { display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 6, color: colors.accent },
  btnBuy: {
    height: 48, borderRadius: 12, padding: '0 18px',
    background: 'linear-gradient(90deg, #14b8a6 0%, #34d399 100%)',
    color: '#0b1b3b', border: 'none', fontSize: 15, fontWeight: 900, cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(20,184,166,0.35)', transform: 'translateZ(0)',
    transition: 'transform .15s ease, box-shadow .15s ease, opacity .2s ease',
  },
  btnBuyHover: { transform: 'translateY(-1px)', boxShadow: '0 10px 26px rgba(20,184,166,0.45)' },
  infoText: { textAlign: 'center', marginBottom: 12, fontSize: 13, fontWeight: 700, color: colors.accent },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  iconRow: { display: 'flex', gap: 8 },
  iconBtn: {
    height: 34, width: 34, borderRadius: '50%',
    background: 'rgba(255,255,255,0.06)', color: colors.text,
    border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center',
    cursor: 'pointer', transition: 'box-shadow .15s ease, transform .15s ease',
  },
  iconBtnHover: {
    boxShadow: '0 0 0 4px rgba(20,184,166,0.25)', transform: 'translateY(-1px)',
  },
}

const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)']

type Props = {
  account: string | null
  minAmount?: number // default 5
  defaultAmount?: string // default '100.00'
  onAfterPurchase?: () => Promise<void> | void
  onShowHistory?: () => void
  onInfo?: () => void
  disabled?: boolean
}

const InfoIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <line x1="12" y1="10" x2="12" y2="16" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="7" r="1.6" fill="currentColor" />
  </svg>
)

const HistoryIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3z" fill="currentColor" opacity="0.85"/>
    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
)

const MiningCard: React.FC<Props> = ({
  account,
  minAmount = 5,
  defaultAmount = '100.00',
  onAfterPurchase,
  onShowHistory,
  onInfo,
  disabled = false,
}) => {
  const [amount, setAmount] = useState<string>(defaultAmount)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [buyHover, setBuyHover] = useState(false)
  const [infoHover, setInfoHover] = useState(false)
  const [histHover, setHistHover] = useState(false)

  const isInvalid = amount !== '' && (isNaN(Number(amount)) || Number(amount) < minAmount)

  const hasSufficientAllowance = async (owner: string, spender: string, amountStr: string) => {
    try {
      const provider = new BrowserProvider((window as any).ethereum)
      const usdt = new Contract(config.usdtAddress, ERC20_ABI, provider)
      const allowance: bigint = await (usdt as any).allowance(owner, spender)
      const need = parseUnits(String(amountStr || '0'), config.usdtDecimals)
      return allowance >= need
    } catch {
      return false
    }
  }

  const handleBuy = async () => {
    if (!account) { showErrorToast('Please connect your wallet.'); return }
    if (isInvalid) { showErrorToast(`Minimum ${minAmount} USDT required.`); return }

    setOpen(true)
    try {
      setMsg('Checking token allowance...')
      const allowanceOk = await hasSufficientAllowance(account, config.contractAddress, amount)

      if (!allowanceOk) {
        setMsg(`Approving ${amount} USDT...`)
        const txApprove = await approveUSDT(amount)
        // @ts-ignore
        if (txApprove?.wait) await txApprove.wait()
      }

      setMsg('Processing purchase...')
      const txBuy = await buyMiner(amount)
      // @ts-ignore
      if (txBuy?.wait) await txBuy.wait()

      try {
        // @ts-ignore
        if (txBuy?.hash) {
          await recordMiningPurchaseLite(txBuy.hash)
        }
      } catch (e) {
        showErrorToast(e, 'On-chain OK, off-chain record failed. Please refresh.')
      }

      showSuccessToast(`Purchased $${Number(amount).toFixed(2)} mining power`)
      if (onAfterPurchase) await onAfterPurchase()
    } catch (e) {
      showErrorToast(e, 'Failed to buy miner')
    } finally {
      setOpen(false)
      setMsg('')
    }
  }

  return (
    <>
      <ProcessingOverlay
        open={open}
        title="Processing"
        message={msg}
        note="Please approve the prompts in your wallet."
      />

      <div className="lxr-mining-card" style={styles.cardShell}>
        <div className="lxr-network-lines" />
        <div className="lxr-crypto-mesh" />
        <div className="lxr-circuit" />
        <div className="lxr-holo" />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div className="lxr-lexori-logo" style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>LEXORI</div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: colors.accent }}>MINING CARD</div>
            </div>
            <div style={styles.iconRow}>
              {onInfo && (
                <button
                  title="How mining works"
                  aria-label="Mining info"
                  style={{ ...styles.iconBtn, ...(infoHover ? styles.iconBtnHover : {}) }}
                  onMouseEnter={() => setInfoHover(true)}
                  onMouseLeave={() => setInfoHover(false)}
                  onClick={() => onInfo()}
                >
                  <InfoIcon />
                </button>
              )}
              {onShowHistory && (
                <button
                  title="View Miner History"
                  aria-label="View Miner History"
                  style={{ ...styles.iconBtn, ...(histHover ? styles.iconBtnHover : {}) }}
                  onMouseEnter={() => setHistHover(true)}
                  onMouseLeave={() => setHistHover(false)}
                  onClick={() => onShowHistory()}
                >
                  <HistoryIcon />
                </button>
              )}
            </div>
          </div>

          <div style={styles.infoText}>
            Earn coins daily equal to your invested USDT, for 30 days.
            <br />Example: invest ${minAmount} USDT → {minAmount} coins/day × 30 days.
          </div>

          <div className="lxr-panel">
            <div style={styles.panel}>
              <div style={{ flex: 1 }}>
                <label htmlFor="lxr-qty" style={styles.label}>Quantity (USD)</label>
                <input
                  id="lxr-qty"
                  type="number"
                  min={minAmount}
                  step="0.01"
                  placeholder={`${minAmount.toFixed(2)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={styles.input}
                />
              </div>
              <button
                onClick={handleBuy}
                disabled={disabled || isInvalid}
                style={{ ...styles.btnBuy, ...(buyHover && !disabled && !isInvalid ? styles.btnBuyHover : {}) }}
                onMouseEnter={() => setBuyHover(true)}
                onMouseLeave={() => setBuyHover(false)}
              >
                BUY NOW
              </button>
            </div>
            {isInvalid && <div style={styles.hint}>Minimum {minAmount} USDT required.</div>}
          </div>
        </div>
      </div>
    </>
  )
}

export default MiningCard
