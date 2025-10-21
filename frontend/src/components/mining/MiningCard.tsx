import React, { useState } from 'react'
import { BrowserProvider, Contract, parseUnits } from 'ethers'
import ProcessingOverlay from '../common/ProcessingOverlay'
import { approveUSDT, buyMiner } from '../../utils/contract'
import { recordMiningPurchaseLite } from '../../services/api'
import { config } from '../../config'
import { showErrorToast, showSuccessToast } from '../../utils/notification'

const colors = {
  accent: '#14b8a6',
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  cardShell: { background: 'transparent', border: 'none', padding: 0 },
  panel: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  input: {
    height: 40, borderRadius: 10, border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 10px', background: 'rgba(255,255,255,0.05)', outline: 'none', color: colors.text, fontSize: 14, width: '100%',
  },
  label: { display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: colors.accent },
  btn: {
    height: 44, borderRadius: 10,
    background: `linear-gradient(45deg, ${colors.accent}, #e0f5ed)`,
    color: '#0b1b3b', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: '0 12px',
    boxShadow: '0 4px 15px rgba(20,184,166,0.3)',
  },
  info: { textAlign: 'center', marginBottom: 12, fontSize: 13, fontWeight: 600, color: colors.accent },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
}

const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)']

type Props = {
  account: string | null
  minAmount?: number // default 5
  defaultAmount?: string // default '5.00'
  onAfterPurchase?: () => Promise<void> | void
  onShowHistory?: () => void
  disabled?: boolean
}

const MiningCard: React.FC<Props> = ({
  account,
  minAmount = 5,
  defaultAmount = '5.00',
  onAfterPurchase,
  onShowHistory,
  disabled = false,
}) => {
  const [amount, setAmount] = useState<string>(defaultAmount)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')

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
            {onShowHistory && (
              <button
                title="View Miner History"
                aria-label="View Miner History"
                style={{
                  height: 32, width: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: colors.text,
                  border: `1px solid ${colors.grayLine}`, display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}
                onClick={() => onShowHistory()}
              >
                i
              </button>
            )}
          </div>

          <div style={styles.info}>
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
              <button className="lxr-buy-btn" onClick={handleBuy} disabled={disabled || isInvalid}>
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
