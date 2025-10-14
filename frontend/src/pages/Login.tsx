// frontend/src/pages/Login.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '../context/WalletContext'
import { isRegistered } from '../utils/contract'
import { useNavigate } from 'react-router-dom'
import { isValidAddress } from '../utils/wallet'

type Phase = 'idle' | 'connecting' | 'checking'

const colors = {
  bgLightGreen: '#e8f9f1',
  bgLightGreen2: '#e0f5ed',
  deepNavy: '#0b1b3b',
  accent: '#14b8a6',
  accentDark: '#0e9c8c',
  white: '#ffffff',
}

const styles = {
  page: {
    minHeight: '100vh',
    width: '100%',
    background: `linear-gradient(180deg, ${colors.bgLightGreen} 0%, ${colors.bgLightGreen2} 100%)`,
    color: colors.deepNavy,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none' as const,
  },
  wrap: {
    width: '100%',
    maxWidth: 980,
    padding: '56px 24px',
  },
  hero: { textAlign: 'center' as const },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: 'rgba(20,184,166,0.12)',
    color: colors.accentDark,
    marginBottom: 16,
  },
  title: {
    fontSize: '2.3rem',
    fontWeight: 800,
    margin: '0 0 10px 0',
    color: colors.deepNavy,
    letterSpacing: '0.2px',
  },
  subtitle: {
    margin: '0 auto 24px auto',
    fontSize: '1.05rem',
    maxWidth: 780,
    opacity: 0.9,
  },
  cta: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 10,
  },
  button: {
    background: colors.accent,
    color: colors.white,
    border: 'none',
    outline: 'none',
    padding: '14px 22px',
    borderRadius: 14,
    fontSize: '1.05rem',
    fontWeight: 800,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: 220,
  },
  buttonDisabled: { opacity: 0.7, cursor: 'not-allowed' },
  hint: { fontSize: 13, opacity: 0.85 },
} satisfies Record<string, React.CSSProperties | any>

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { connect, isConnecting, account } = useWallet()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string>('')

  // Keep the latest account in a ref to avoid stale-closure in async loops
  const accountRef = useRef<string | null>(account)
  useEffect(() => { accountRef.current = account }, [account])

  const buttonLabel = useMemo(() => {
    if (phase === 'connecting') return 'Connecting...'
    if (phase === 'checking') return 'Checking status...'
    return isValidAddress(account) ? 'Continue' : 'Connect Wallet'
  }, [phase, account])

  // Optional: Block copy/select/context menu
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

  const checkAndRedirect = async (addr: string) => {
    setPhase('checking')
    try {
      const reg = await isRegistered(addr)
      if (reg) navigate('/dashboard', { replace: true })
      else navigate('/register', { replace: true })
    } catch (err: any) {
      setError(typeof err?.message === 'string' ? err.message : 'Failed to check status. Please try again.')
    } finally {
      setPhase('idle')
    }
  }

  // Auto-redirect if wallet already connected
  useEffect(() => {
    if (!isConnecting && phase === 'idle' && isValidAddress(account)) {
      checkAndRedirect(account!)
    }
  }, [account, isConnecting, phase])

  const handleConnect = async () => {
    if (phase !== 'idle' || isConnecting) return
    setError('')

    try {
      // If wallet already connected, just check status
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
        <div style={styles.hero}>
          <div style={styles.badge}>Decentralized • Blockchain‑powered • Web3</div>
          <h1 style={styles.title}>Welcome to our decentralized, blockchain‑powered Web3 community.</h1>
          <p style={styles.subtitle}>Connect your wallet to continue.</p>

          <div style={styles.cta}>
            <button
              onClick={handleConnect}
              disabled={phase !== 'idle' || isConnecting}
              style={{
                ...styles.button,
                ...(phase !== 'idle' || isConnecting ? styles.buttonDisabled : {}),
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = colors.accentDark
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = colors.accent
              }}
            >
              {buttonLabel}
            </button>
            {(phase === 'connecting' || phase === 'checking') && (
              <div style={styles.hint}>Please approve in your wallet…</div>
            )}
            {!!error && <div style={{ ...styles.hint, color: '#b91c1c' }}>{error}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
