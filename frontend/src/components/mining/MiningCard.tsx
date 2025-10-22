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
  text: '#ffffff',       // all text white
  textMuted: '#ffffff',  // muted text also white as requested
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  cardShell: { background: 'transparent', border: 'none', padding: 0 },
  contentWrap: { position: 'relative', zIndex: 2, padding: '16px 14px 18px', color: colors.text },

  // Header
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: 900, letterSpacing: 1, color: colors.text },
  headerSub: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: colors.text },

  // Controls
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 160px',   // Left: input, Right: button
    gridTemplateRows: 'auto 48px',      // Row 1: labels, Row 2: controls (fixed height)
    columnGap: 10,
    rowGap: 6,
    alignItems: 'center',
  },
  label: { fontSize: 12, fontWeight: 800, color: colors.text },
  labelPlaceholder: { fontSize: 12, fontWeight: 800, color: 'transparent', visibility: 'hidden' }, // keeps rows aligned
  input: {
    height: 48, borderRadius: 12, border: '2px solid rgba(255,255,255,0.35)',
    padding: '0 12px', background: 'rgba(255,255,255,0.06)', outline: 'none',
    color: colors.text, fontSize: 15, width: '100%',
  },
  btnBuy: {
    height: 48, borderRadius: 12, padding: '0 18px', width: '100%',
    background: 'linear-gradient(90deg, #14b8a6 0%, #34d399 100%)',
    color: '#0b1b3b', border: 'none', fontSize: 15, fontWeight: 900, cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(20,184,166,0.35)', transform: 'translateZ(0)',
    transition: 'transform .15s ease, box-shadow .15s ease, opacity .2s ease',
  },
  btnBuyHover: { transform: 'translateY(-1px)', boxShadow: '0 10px 26px rgba(20,184,166,0.45)' },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },

  // Info text
  infoText: { textAlign: 'center', margin: '10px 0 16px', fontSize: 13, fontWeight: 700, color: colors.text },

  // Icons
  iconBtn: {
    height: 34, width: 34, borderRadius: '50%',
    background: 'rgba(255,255,255,0.06)', color: colors.text,
    border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center',
    cursor: 'pointer', transition: 'box-shadow .15s ease, transform .15s ease',
  },
  iconBtnHover: { boxShadow: '0 0 0 4px rgba(20,184,166,0.25)', transform: 'translateY(-1px)' },
}

const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)']

type Props = {
  account: string | null
  minAmount?: number // default 5
  defaultAmount?: string // default '100'
  onAfterPurchase?: () => Promise<void> | void
  onShowHistory?: () => void
  disabled?: boolean
}

const HistoryIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3z" fill="currentColor" opacity="0.85"/>
    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
)

const MiningCard: React.FC<Props> = ({
  account,
  minAmount = 5,
  defaultAmount = '100',
  onAfterPurchase,
  onShowHistory,
  disabled = false,
}) => {
  const [amount, setAmount] = useState<string>(defaultAmount)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [buyHover, setBuyHover] = useState(false)
  const [histHover, setHistHover] = useState(false)

  // Integer-only validation
  const parsed = amount === '' ? NaN : parseInt(amount, 10)
  const isInvalid = amount !== '' && (!Number.isInteger(parsed) || parsed < minAmount)

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
    if (isInvalid || amount === '') { showErrorToast(`Minimum ${minAmount} USDT required. Whole numbers only.`); return }

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

      showSuccessToast(`Purchased $${Number(amount).toFixed(0)} mining power`)
      if (onAfterPurchase) await onAfterPurchase()
    } catch (e) {
      showErrorToast(e, 'Failed to buy miner')
    } finally {
      setOpen(false)
      setMsg('')
    }
  }

  // Sanitize input to allow digits only
  const handleChange = (v: string) => {
    const cleaned = v.replace(/\D/g, '') // keep only digits
    setAmount(cleaned)
  }

  const preventDecimalKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const blocked = ['.', ',', 'e', 'E', '+', '-']
    if (blocked.includes(e.key)) e.preventDefault()
  }

  const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    e.preventDefault()
    const text = (e.clipboardData || (window as any).clipboardData).getData('text') || ''
    const cleaned = text.replace(/\D/g, '')
    document.execCommand('insertText', false, cleaned)
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

        <div style={styles.contentWrap}>
          {/* Header */}
          <div style={styles.headerRow}>
            <div>
              <div className="lxr-lexori-logo" style={styles.headerTitle as any}>LEXORI</div>
              <div style={styles.headerSub}>MINING CARD</div>
            </div>

            {/* Only History button */}
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

          {/* Info text */}
          <div style={styles.infoText}>
            Earn coins daily equal to your invested USDT, for 30 days.
            <br />Example: invest ${minAmount} USDT → {minAmount} coins/day × 30 days.
          </div>

          {/* Form (perfectly aligned) */}
          <div className="lxr-panel" style={styles.formGrid}>
            {/* Row 1: labels */}
            <label htmlFor="lxr-qty" style={styles.label}>Quantity (USDT)</label>
            <div aria-hidden="true" style={styles.labelPlaceholder}>Buy</div>

            {/* Row 2: controls */}
            <input
              id="lxr-qty"
              type="number"
              min={minAmount}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={`${minAmount}`}
              value={amount}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={preventDecimalKeys}
              onPaste={handlePaste}
              onWheel={(e) => e.currentTarget.blur()}
              style={styles.input}
            />
            <button
              onClick={handleBuy}
              disabled={disabled || isInvalid || amount === ''}
              style={{ ...styles.btnBuy, ...(buyHover && !disabled && !isInvalid && amount !== '' ? styles.btnBuyHover : {}) }}
              onMouseEnter={() => setBuyHover(true)}
              onMouseLeave={() => setBuyHover(false)}
            >
              BUY NOW
            </button>
          </div>

          {(isInvalid || amount === '') && (
            <div style={styles.hint}>
              Minimum {minAmount} USDT required. Whole numbers only.
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default MiningCard
