import React, { useEffect, useMemo, useState } from 'react'
import { BrowserProvider, Contract, parseUnits } from 'ethers'
import ProcessingOverlay from '../common/ProcessingOverlay'
import Surface from '../common/Surface'
import { approveUSDT, registerUser, signAuthMessage } from '../../utils/contract'
import { upsertUserFromChain } from '../../services/api'
import { isValidAddress } from '../../utils/wallet'
import { showErrorToast, showSuccessToast } from '../../utils/notification'
import { config } from '../../config'

const colors = {
  accent: '#14b8a6',
  accentSoft: '#e0f5ed',
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  danger: '#ef4444',
  grayLine: 'rgba(255,255,255,0.12)',
}

const styles: Record<string, React.CSSProperties> = {
  sectionTitle: { margin: '0 0 10px 0', fontSize: '1.05rem', fontWeight: 900 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr', gap: 12 },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontWeight: 700, fontSize: '0.95rem', color: colors.text },
  input: {
    height: 46,
    borderRadius: 12,
    border: '2px solid rgba(20,184,166,0.3)',
    padding: '0 12px',
    fontSize: '1rem',
    outline: 'none',
    color: colors.text,
    background: 'rgba(255,255,255,0.05)',
  },
  inputLocked: { background: 'rgba(255,255,255,0.08)', cursor: 'not-allowed' },
  hint: { fontSize: 12, color: colors.textMuted },
  dangerText: { fontSize: 12, color: colors.danger, fontWeight: 700 },
  button: {
    height: 48,
    borderRadius: 14,
    background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`,
    color: '#0b1b3b',
    border: 'none',
    fontSize: '1.05rem',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(20,184,166,0.3)',
  },
  buttonDisabled: { opacity: 0.65, cursor: 'not-allowed' },
  feeBox: {
    marginTop: 6,
    padding: '10px 12px',
    borderRadius: 12,
    background: 'rgba(20,184,166,0.10)',
    border: '1px solid rgba(20,184,166,0.25)',
    fontSize: '0.95rem',
    color: colors.text,
  },
}

const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)']

const MIN_ID_LEN = 6
const MAX_ID_LEN = 8

type Props = {
  account: string | null
  initialReferral?: string
  lockReferral?: boolean
  feeLabel?: string // default: config.registrationFee || '12'
  onSuccess?: () => Promise<void> | void
}

const RegistrationForm: React.FC<Props> = ({
  account,
  initialReferral = '',
  lockReferral = false,
  feeLabel,
  onSuccess,
}) => {
  const fee = useMemo(() => (feeLabel || config.registrationFee || '12'), [feeLabel])

  const [userId, setUserId] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [referralLocked, setReferralLocked] = useState<boolean>(lockReferral && !!initialReferral)
  const [fundCode, setFundCode] = useState('')
  const [confirmFundCode, setConfirmFundCode] = useState('')

  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const ref = (initialReferral || '').toUpperCase().trim()
    if (ref) {
      setReferralCode(ref)
      if (!lockReferral && ref.length >= MIN_ID_LEN && ref.length <= MAX_ID_LEN) {
        setReferralLocked(true)
      } else if (lockReferral) {
        setReferralLocked(true)
      }
    }
  }, [initialReferral, lockReferral])

  const isFormValid = useMemo(() => {
    const uidLen = userId.trim().length
    const refLen = referralCode.trim().length
    return (
      uidLen >= MIN_ID_LEN && uidLen <= MAX_ID_LEN &&
      refLen >= MIN_ID_LEN && refLen <= MAX_ID_LEN &&
      fundCode.trim().length >= 4 &&
      fundCode === confirmFundCode
    )
  }, [userId, referralCode, fundCode, confirmFundCode])

  const hasSufficientAllowance = async (owner: string, spender: string, feeStr: string) => {
    try {
      const provider = new BrowserProvider((window as any).ethereum)
      const usdt = new Contract(config.usdtAddress, ERC20_ABI, provider)
      const allowance: bigint = await (usdt as any).allowance(owner, spender)
      const need = parseUnits(String(feeStr || '0'), config.usdtDecimals)
      return allowance >= need
    } catch {
      return false
    }
  }

  const handleRegister = async () => {
    if (!isValidAddress(account)) { showErrorToast('Please connect your wallet first.'); return }
    if (!isFormValid) { showErrorToast('Please fill all fields correctly.'); return }

    setOpen(true)
    try {
      setMsg('Checking token allowance...')
      const allowanceOk = await hasSufficientAllowance(account!, config.contractAddress, fee)

      if (!allowanceOk) {
        setMsg(`Approving ${fee} USDT...`)
        const approveTx = await approveUSDT(fee)
        // @ts-ignore
        await approveTx?.wait?.()
      }

      setMsg('Submitting your registration...')
      const registerTx = await registerUser(
        userId.trim().toUpperCase(),
        referralCode.trim().toUpperCase(),
        fundCode
      )
      // @ts-ignore
      await registerTx?.wait?.()

      setMsg('Syncing profile (backend)...')
      const { timestamp, signature } = await signAuthMessage(account!)
      await upsertUserFromChain(account!, timestamp, signature)

      showSuccessToast('Registration successful!')
      if (onSuccess) await onSuccess()
    } catch (e) {
      showErrorToast(e, 'Registration failed')
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

      <Surface>
        <h2 style={styles.sectionTitle}>Registration form</h2>
        <div style={styles.formRow}>
          <div style={styles.inputGroup}>
            <label htmlFor="userId" style={styles.label}>Your User ID (6–8 characters)</label>
            <input
              id="userId"
              type="text"
              value={userId}
              maxLength={MAX_ID_LEN}
              onChange={(e) => setUserId(e.target.value.toUpperCase())}
              placeholder="e.g., MYID12 / MYID1234"
              style={styles.input}
            />
            <span style={styles.hint}>
              Use uppercase letters/numbers. Must be 6–8 characters to match the contract.
            </span>
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="referralCode" style={styles.label}>Referrer’s ID (6–8 characters)</label>
            <input
              id="referralCode"
              type="text"
              value={referralCode}
              maxLength={MAX_ID_LEN}
              onChange={(e) => { if (!referralLocked) setReferralCode(e.target.value.toUpperCase()) }}
              placeholder="Enter your referrer’s ID"
              style={{ ...styles.input, ...(referralLocked ? styles.inputLocked : {}) }}
              disabled={referralLocked}
            />
            {referralLocked ? (
              <span style={styles.hint}>Referral ID locked.</span>
            ) : (
              <span style={styles.hint}>If you arrived via a referral link, this may auto‑fill and lock.</span>
            )}
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="fundCode" style={styles.label}>Fund Code (min 4 chars)</label>
            <input
              id="fundCode"
              type="password"
              value={fundCode}
              onChange={(e) => setFundCode(e.target.value)}
              placeholder="Enter a secret code"
              style={styles.input}
            />
            <span style={styles.dangerText}>
              WARNING: This code is required for withdrawals. If you lose it, it cannot be recovered by anyone.
            </span>
            <span style={styles.hint}>Write it down and store it safely. Do not share with anyone.</span>
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="confirmFundCode" style={styles.label}>Confirm Fund Code</label>
            <input
              id="confirmFundCode"
              type="password"
              value={confirmFundCode}
              onChange={(e) => setConfirmFundCode(e.target.value)}
              placeholder="Re‑enter your secret code"
              style={styles.input}
            />
          </div>

          <button
            onClick={handleRegister}
            disabled={!isFormValid}
            style={{ ...styles.button, ...(!isFormValid ? styles.buttonDisabled : {}) }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(45deg, ${colors.accentSoft}, ${colors.accent})` }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})` }}
          >
            Register Now — {fee} USDT
          </button>
        </div>

        {/* Optional fee explanation block */}
        <div style={{ marginTop: 12 }}>
          <h2 style={styles.sectionTitle}>Why the {fee} USDT fee?</h2>
          <p style={styles.hint}>
            To keep our decentralized community healthy and spam‑free, we require a small, one‑time registration fee of <strong style={{ color: colors.text }}>{fee} USDT</strong>.
            This helps prevent bot signups, protects genuine members, and improves the overall quality of the network.
          </p>
          <div style={styles.feeBox}>
            What you’ll need:
            <ul style={{ margin: '6px 0 0 18px' }}>
              <li>6–8‑character User ID</li>
              <li>6–8‑character Referrer’s ID</li>
              <li>A secret Fund Code (min 4 chars) for withdrawals</li>
              <li>{fee} USDT balance in your wallet</li>
            </ul>
          </div>
        </div>
      </Surface>
    </>
  )
}

export default RegistrationForm
