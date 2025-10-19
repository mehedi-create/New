// frontend/src/pages/Register.tsx
import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { approveUSDT, registerUser, signAuthMessage } from '../utils/contract'
import { upsertUserFromChain } from '../services/api'
import { showSuccessToast, showErrorToast } from '../utils/notification'
import { isValidAddress } from '../utils/wallet'

const colors = {
  accent: '#14b8a6',
  accentSoft: '#e0f5ed',
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  danger: '#ef4444',
  grayLine: 'rgba(255,255,255,0.12)',
}

type Style = React.CSSProperties
const styles: Record<string, Style> = {
  page: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    padding: '24px 12px',
    color: colors.text,
  },
  wrap: { width: '100%', maxWidth: 1100 },
  header: { marginBottom: 12, textAlign: 'center' },
  brand: { fontWeight: 900, fontSize: '1.8rem', letterSpacing: 1 },
  tagline: { marginTop: 6, fontSize: '1rem', color: colors.textMuted },

  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'stretch' },
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

  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  overlayCard: {
    minWidth: 300,
    maxWidth: 420,
    padding: 18,
    borderRadius: 14,
    background: `linear-gradient(135deg, #0b1b3b 0%, #163057 100%)`,
    color: colors.text,
    border: `1px solid ${colors.grayLine}`,
    boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
    textAlign: 'center',
  },
  spinner: {
    width: 26,
    height: 26,
    margin: '0 auto 8px',
    border: '3px solid rgba(255,255,255,0.2)',
    borderTopColor: colors.accent,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  smallNote: { marginTop: 6, fontSize: 12, color: colors.textMuted },
}

// Spinner keyframes
const injectSpinnerKeyframes = () => {
  const id = 'kf-spin'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.innerHTML = `@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`
  document.head.appendChild(style)
}

// New constraints and fee
const MIN_ID_LEN = 6
const MAX_ID_LEN = 8
const FIXED_FEE = '12'

// Surface wrapper (global theme classes)
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="lxr-surface">
    <div className="lxr-surface-lines" />
    <div className="lxr-surface-mesh" />
    <div className="lxr-surface-circuit" />
    <div className="lxr-surface-holo" />
    <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
  </div>
)

const Register: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { account, refreshStatus } = useWallet()

  const [userId, setUserId] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [referralLocked, setReferralLocked] = useState(false)
  const [fundCode, setFundCode] = useState('')
  const [confirmFundCode, setConfirmFundCode] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [isFormValid, setIsFormValid] = useState(false)
  const [fee] = useState<string>(FIXED_FEE)

  useEffect(() => { injectSpinnerKeyframes() }, [])

  // Prefill ref from URL and lock if valid
  useEffect(() => {
    const ref = (searchParams.get('ref') || '').toUpperCase().trim()
    if (ref) {
      setReferralCode(ref)
      if (ref.length >= MIN_ID_LEN && ref.length <= MAX_ID_LEN) {
        setReferralLocked(true)
      }
    }
  }, [searchParams])

  // Block copy/select/context menu (optional)
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    document.addEventListener('copy', prevent)
    document.addEventListener('cut', prevent)
    document.addEventListener('contextmenu', prevent)
    document.addEventListener('selectstart', prevent)
    return () => {
      document.removeEventListener('copy', prevent)
      document.removeEventListener('cut', prevent)
      document.removeEventListener('contextmenu', prevent)
      document.removeEventListener('selectstart', prevent)
    }
  }, [])

  // Validate inputs (6–8 chars)
  useEffect(() => {
    const uidLen = userId.trim().length
    const refLen = referralCode.trim().length
    const valid =
      uidLen >= MIN_ID_LEN && uidLen <= MAX_ID_LEN &&
      refLen >= MIN_ID_LEN && refLen <= MAX_ID_LEN &&
      fundCode.trim().length >= 4 &&
      fundCode === confirmFundCode
    setIsFormValid(valid)
  }, [userId, referralCode, fundCode, confirmFundCode])

  const handleRegister = async () => {
    if (!isValidAddress(account)) {
      showErrorToast('Please connect your wallet first.')
      return
    }
    if (!isFormValid) {
      showErrorToast('Please fill all fields correctly.')
      return
    }

    setIsProcessing(true)
    try {
      // 1) Approve USDT (fixed 12 USDT)
      setLoadingMessage(`Preparing payment of ${fee} USDT... (Approval)`)
      const approveTx = await approveUSDT(fee)
      await approveTx.wait()

      // 2) Register on-chain
      setLoadingMessage('Submitting your registration...')
      const registerTx = await registerUser(
        userId.trim().toUpperCase(),
        referralCode.trim().toUpperCase(),
        fundCode
      )
      await registerTx.wait()

      // 3) Upsert off-chain (signed)
      const { timestamp, signature } = await signAuthMessage(account!)
      await upsertUserFromChain(account!, timestamp, signature)

      showSuccessToast('Registration successful! Redirecting to dashboard...')
      await refreshStatus()
      navigate('/dashboard', { replace: true })
    } catch (error: any) {
      showErrorToast(error, 'Registration failed')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div style={styles.page}>
      {isProcessing && (
        <div style={styles.overlay}>
          <div style={styles.overlayCard}>
            <div style={styles.spinner} />
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Processing</div>
            <div style={{ fontSize: '0.95rem', color: colors.textMuted }}>{loadingMessage}</div>
            <div style={styles.smallNote}>Please approve the prompts in your wallet.</div>
          </div>
        </div>
      )}

      <div style={styles.wrap}>
        <header style={styles.header}>
          <h1 className="lxr-lexori-logo" style={styles.brand as any}>Create your Web3 account</h1>
          <p style={styles.tagline}>
            A clean, fair and community‑driven space — powered by smart contracts.
          </p>
        </header>

        <div style={styles.grid}>
          {/* Form */}
          <section>
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
                    disabled={isProcessing}
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
                    disabled={isProcessing || referralLocked}
                  />
                  {referralLocked ? (
                    <span style={styles.hint}>Referral ID set from link and locked.</span>
                  ) : (
                    <span style={styles.hint}>If you arrived via a referral link, this will auto‑fill and lock.</span>
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
                    disabled={isProcessing}
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
                    disabled={isProcessing}
                  />
                </div>

                <button
                  onClick={handleRegister}
                  disabled={!isFormValid || isProcessing}
                  style={{ ...styles.button, ...(isFormValid && !isProcessing ? {} : styles.buttonDisabled) }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(45deg, ${colors.accentSoft}, ${colors.accent})` }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})` }}
                >
                  Register Now — {fee} USDT
                </button>
              </div>
            </Surface>
          </section>

          {/* Fee explanation */}
          <section>
            <Surface>
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
              <p style={{ ...styles.smallNote, marginTop: 8 }}>
                Note: If your current smart contract still enforces a different fee or exactly 6 chars only, please update it to support 6–8 chars and 12 USDT.
              </p>
            </Surface>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Register
