// frontend/src/pages/Register.tsx
import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { approveUSDT, registerUser, getRegistrationFee, signAuthMessage } from '../utils/contract'
import { upsertUserFromChain } from '../services/api'
import { showSuccessToast, showErrorToast } from '../utils/notification'
import { isValidAddress } from '../utils/wallet'
import { config } from '../config'

const colors = {
  bgLightGreen: '#e8f9f1',
  bgLightGreen2: '#e0f5ed',
  deepNavy: '#0b1b3b',
  navySoft: '#163057',
  accent: '#14b8a6',
  accentDark: '#0e9c8c',
  white: '#ffffff',
  danger: '#b91c1c',
  mutedGray: '#eef2f6',
}

type Style = React.CSSProperties
const styles: Record<string, Style> = {
  page: {
    minHeight: '100vh',
    width: '100%',
    background: `linear-gradient(180deg, ${colors.bgLightGreen} 0%, ${colors.bgLightGreen2} 100%)`,
    color: colors.deepNavy,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
  },
  wrap: {
    width: '100%',
    maxWidth: 1100,
    padding: '40px 18px 56px',
  },
  header: {
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: '2.1rem',
    fontWeight: 800,
    color: colors.deepNavy,
    letterSpacing: '0.2px',
  },
  tagline: {
    marginTop: 6,
    fontSize: '1rem',
    color: colors.navySoft,
    opacity: 0.95,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 20,
    alignItems: 'stretch',
  },
  panel: {
    padding: 18,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.60)',
    border: '1px solid rgba(11,27,59,0.08)',
    boxShadow: '0 10px 26px rgba(11,27,59,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    margin: '0 0 10px 0',
    fontSize: '1.1rem',
    fontWeight: 900,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 12,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: colors.navySoft,
  },
  input: {
    height: 46,
    borderRadius: 12,
    border: '1px solid rgba(11,27,59,0.15)',
    padding: '0 12px',
    fontSize: '1rem',
    outline: 'none',
    color: colors.deepNavy,
    background: colors.white,
  },
  inputLocked: {
    background: colors.mutedGray,
    cursor: 'not-allowed',
  },
  hint: {
    fontSize: 12,
    color: colors.navySoft,
    opacity: 0.9,
  },
  dangerText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: 700,
  },
  button: {
    height: 48,
    borderRadius: 14,
    background: colors.accent,
    color: colors.white,
    border: 'none',
    fontSize: '1.05rem',
    fontWeight: 800,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  buttonDisabled: {
    opacity: 0.65,
    cursor: 'not-allowed',
  },
  feeBox: {
    marginTop: 6,
    padding: '10px 12px',
    borderRadius: 12,
    background: 'rgba(20,184,166,0.08)',
    border: '1px solid rgba(20,184,166,0.25)',
    fontSize: '0.95rem',
    color: colors.navySoft,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(255,255,255,0.65)',
    backdropFilter: 'blur(3px)',
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
    background: colors.white,
    color: colors.deepNavy,
    border: '1px solid rgba(11,27,59,0.08)',
    boxShadow: '0 12px 28px rgba(11,27,59,0.10)',
    textAlign: 'center',
  },
  spinner: {
    width: 26,
    height: 26,
    margin: '0 auto 8px',
    border: '3px solid rgba(11,27,59,0.15)',
    borderTopColor: colors.accentDark,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  smallNote: {
    marginTop: 6,
    fontSize: 12,
    color: colors.navySoft,
  },
}

// CSS keyframe for spinner (inline)
const injectSpinnerKeyframes = () => {
  const id = 'kf-spin'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.innerHTML = `@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`
  document.head.appendChild(style)
}

const EXACT_LEN = 6 // Smart contract currently requires exactly 6 chars

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
  const [fee, setFee] = useState<string>(config.registrationFee || '12')

  useEffect(() => {
    injectSpinnerKeyframes()
  }, [])

  useEffect(() => {
    // Load latest fee from chain (lightweight read)
    ;(async () => {
      try {
        const f = await getRegistrationFee()
        if (Number(f) > 0) setFee(f)
      } catch {}
    })()
  }, [])

  // Prefill ref from URL and lock if valid
  useEffect(() => {
    const ref = (searchParams.get('ref') || '').toUpperCase().trim()
    if (ref) {
      setReferralCode(ref)
      if (ref.length === EXACT_LEN) {
        setReferralLocked(true)
      }
    }
  }, [searchParams])

  // Block copy/select/context menu on this page
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

  // Validate inputs
  useEffect(() => {
    const valid =
      userId.trim().length === EXACT_LEN &&
      referralCode.trim().length === EXACT_LEN &&
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
      // 1) Approve USDT
      setLoadingMessage(`Preparing payment of ${fee} USDT... (Approval)`)
      const approveTx = await approveUSDT(fee)
      await approveTx.wait()

      // 2) Register on-chain
      setLoadingMessage('Submitting your registration...')
      const registerTx = await registerUser(userId.trim().toUpperCase(), referralCode.trim().toUpperCase(), fundCode)
      await registerTx.wait()

      // 3) Upsert off-chain (signed) — lightweight, queued on server
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
            <div style={{ fontSize: '0.95rem', color: colors.navySoft }}>{loadingMessage}</div>
            <div style={styles.smallNote}>Please approve the prompts in your wallet.</div>
          </div>
        </div>
      )}

      <div style={styles.wrap}>
        <header style={styles.header}>
          <h1 style={styles.title}>Create your Web3 account</h1>
          <p style={styles.tagline}>
            A clean, fair and community‑driven space—powered by smart contracts.
          </p>
        </header>

        <div style={styles.grid}>
          {/* Form first */}
          <section style={styles.panel}>
            <h2 style={styles.sectionTitle}>Registration form</h2>

            <div style={styles.formRow}>
              <div style={styles.inputGroup}>
                <label htmlFor="userId" style={styles.label}>
                  Your User ID (exactly {EXACT_LEN} characters)
                </label>
                <input
                  id="userId"
                  type="text"
                  value={userId}
                  maxLength={EXACT_LEN}
                  onChange={(e) => setUserId(e.target.value.toUpperCase())}
                  placeholder="e.g., MYID12"
                  style={styles.input}
                  disabled={isProcessing}
                />
                <span style={styles.hint}>
                  Use uppercase letters/numbers. This must be exactly {EXACT_LEN} to match the smart
                  contract.
                </span>
              </div>

              <div style={styles.inputGroup}>
                <label htmlFor="referralCode" style={styles.label}>
                  Referrer’s ID (exactly {EXACT_LEN} characters)
                </label>
                <input
                  id="referralCode"
                  type="text"
                  value={referralCode}
                  maxLength={EXACT_LEN}
                  onChange={(e) => {
                    if (!referralLocked) setReferralCode(e.target.value.toUpperCase())
                  }}
                  placeholder="Enter your referrer’s ID"
                  style={{
                    ...styles.input,
                    ...(referralLocked ? styles.inputLocked : {}),
                  }}
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
                style={{
                  ...styles.button,
                  ...(isFormValid && !isProcessing ? {} : styles.buttonDisabled),
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = colors.accentDark }}
                onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = colors.accent }}
              >
                Register Now — {fee} USDT
              </button>
            </div>
          </section>

          {/* Fee explanation below */}
          <section style={styles.panel}>
            <h2 style={styles.sectionTitle}>Why the {fee} USDT fee?</h2>
            <p style={styles.hint}>
              To keep our decentralized community healthy and spam‑free, we require a small, one‑time registration fee of <strong>{fee} USDT</strong>.
              This helps prevent bot signups, protects genuine members, and improves the overall quality of the network.
            </p>
            <div style={styles.feeBox}>
              What you’ll need:
              <ul style={{ margin: '6px 0 0 18px' }}>
                <li>Exactly {EXACT_LEN}‑character User ID</li>
                <li>Exactly {EXACT_LEN}‑character Referrer’s ID</li>
                <li>A secret Fund Code (min 4 chars) for withdrawals</li>
                <li>{fee} USDT balance in your wallet</li>
              </ul>
            </div>
            <p style={{ ...styles.smallNote, marginTop: 8 }}>
              Note: IDs longer than {EXACT_LEN} are not supported by the current smart contract. If you need 6–8 later, we must deploy a new contract.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Register
