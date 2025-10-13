// frontend/src/pages/Register.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { config } from '../config';
import { approveUSDT, registerUser } from '../utils/contract';
import { showSuccessToast, showErrorToast } from '../utils/notification';

const colors = {
  bgLightGreen: '#e8f9f1',
  bgLightGreen2: '#e0f5ed',
  deepNavy: '#0b1b3b',
  navySoft: '#163057',
  accent: '#14b8a6',
  accentDark: '#0e9c8c',
  white: '#ffffff',
  danger: '#b91c1c',
};

const styles: Record<string, React.CSSProperties> = {
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
    padding: '48px 24px 56px',
  },
  header: {
    marginBottom: 22,
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: '2.2rem',
    fontWeight: 800,
    color: colors.deepNavy,
    letterSpacing: '0.2px',
  },
  tagline: {
    marginTop: 8,
    fontSize: '1.05rem',
    color: colors.navySoft,
    opacity: 0.95,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.1fr 1fr',
    gap: 28,
  },
  panel: {
    padding: 24,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.60)',
    border: '1px solid rgba(11,27,59,0.08)',
    boxShadow: '0 10px 26px rgba(11,27,59,0.06)',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '1.2rem',
    fontWeight: 800,
  },
  bullet: {
    margin: '8px 0',
    lineHeight: 1.55,
    color: colors.navySoft,
    fontSize: '0.98rem',
  },
  highlight: {
    display: 'inline-flex',
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(20,184,166,0.12)',
    color: colors.accentDark,
    fontWeight: 800,
    fontSize: 12,
    marginLeft: 8,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 14,
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
    height: 48,
    borderRadius: 12,
    border: '1px solid rgba(11,27,59,0.15)',
    padding: '0 14px',
    fontSize: '1rem',
    outline: 'none',
    color: colors.deepNavy,
    background: colors.white,
  },
  hint: {
    fontSize: 12,
    color: colors.navySoft,
    opacity: 0.85,
  },
  dangerText: {
    fontSize: 12,
    color: colors.danger,
  },
  button: {
    height: 50,
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
    marginTop: 10,
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
    minWidth: 320,
    maxWidth: 420,
    padding: 20,
    borderRadius: 14,
    background: colors.white,
    color: colors.deepNavy,
    border: '1px solid rgba(11,27,59,0.08)',
    boxShadow: '0 12px 28px rgba(11,27,59,0.10)',
    textAlign: 'center' as const,
  },
  spinner: {
    width: 26,
    height: 26,
    margin: '0 auto 10px',
    border: '3px solid rgba(11,27,59,0.15)',
    borderTopColor: colors.accentDark,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  smallNote: {
    marginTop: 8,
    fontSize: 12,
    color: colors.navySoft,
  },
  // Responsive
  '@media (max-width: 880px)': {
    grid: { display: 'block' },
  },
};

// CSS keyframe for spinner (inline)
const injectSpinnerKeyframes = () => {
  const id = 'kf-spin';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.innerHTML = `@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`;
  document.head.appendChild(style);
};

const Register: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { account, refreshStatus } = useWallet();

  const [userId, setUserId] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [fundCode, setFundCode] = useState('');
  const [confirmFundCode, setConfirmFundCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isFormValid, setIsFormValid] = useState(false);

  useEffect(() => {
    injectSpinnerKeyframes();
  }, []);

  // Pre-fill ref from URL (no auto actions)
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setReferralCode(ref.toUpperCase());
  }, [searchParams]);

  // Block copy/select/context menu on this page
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('copy', prevent);
    document.addEventListener('cut', prevent);
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('selectstart', prevent);
    return () => {
      document.removeEventListener('copy', prevent);
      document.removeEventListener('cut', prevent);
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('selectstart', prevent);
    };
  }, []);

  // Validate inputs
  useEffect(() => {
    const valid =
      userId.trim().length === 6 &&
      referralCode.trim().length === 6 &&
      fundCode.trim().length >= 4 &&
      fundCode === confirmFundCode;
    setIsFormValid(valid);
  }, [userId, referralCode, fundCode, confirmFundCode]);

  const handleRegister = async () => {
    if (!account) {
      showErrorToast('Please connect your wallet first.');
      return;
    }
    if (!isFormValid) {
      showErrorToast('Please fill all fields correctly.');
      return;
    }

    setIsProcessing(true);
    try {
      // Single user action (one button). Wallet may prompt twice.
      setLoadingMessage(`Preparing payment of ${config.registrationFee} USDT... (Approval)`);
      const approveTx = await approveUSDT(config.registrationFee);
      await approveTx.wait();

      setLoadingMessage('Submitting your registration...');
      const registerTx = await registerUser(userId, referralCode, fundCode);
      await registerTx.wait();

      showSuccessToast('Registration successful! Redirecting to dashboard...');
      await refreshStatus();
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      showErrorToast(error, 'Registration failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={styles.page}>
      {isProcessing && (
        <div style={styles.overlay}>
          <div style={styles.overlayCard}>
            <div style={styles.spinner} />
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Processing</div>
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

        <div style={styles.grid as any}>
          <section style={styles.panel}>
            <h2 style={styles.sectionTitle}>
              Why the $12 USDT fee?
              <span style={styles.highlight}>Anti‑spam protection</span>
            </h2>
            <p style={styles.bullet}>
              To keep our decentralized community healthy and spam‑free, we require a small, one‑time registration fee of <strong>${config.registrationFee} USDT</strong>.
            </p>
            <p style={styles.bullet}>
              This helps prevent bot signups, protects genuine members, and improves the overall quality of the network.
            </p>
            <p style={styles.bullet}>
              The process is fully transparent—handled by a smart contract you control from your own wallet.
            </p>

            <div style={styles.feeBox}>
              What you’ll need:
              <ul style={{ margin: '6px 0 0 18px' }}>
                <li>A unique 6‑character User ID</li>
                <li>Your referrer’s 6‑character ID</li>
                <li>A secret Fund Code (min 4 chars) for withdrawals</li>
                <li>${config.registrationFee} USDT balance in your wallet</li>
              </ul>
            </div>
            <p style={{ ...styles.smallNote, marginTop: 10 }}>
              Note: Your Fund Code is required for withdrawals and cannot be recovered if lost. Store it safely.
            </p>
          </section>

          <section style={styles.panel}>
            <h2 style={styles.sectionTitle}>Complete your registration</h2>
            <div style={styles.formRow}>
              <div style={styles.inputGroup}>
                <label htmlFor="userId" style={styles.label}>Your User ID (6 characters)</label>
                <input
                  id="userId"
                  type="text"
                  value={userId}
                  maxLength={6}
                  onChange={(e) => setUserId(e.target.value.toUpperCase())}
                  placeholder="e.g., MYID12"
                  style={styles.input}
                  disabled={isProcessing}
                />
              </div>

              <div style={styles.inputGroup}>
                <label htmlFor="referralCode" style={styles.label}>Referrer’s ID (6 characters)</label>
                <input
                  id="referralCode"
                  type="text"
                  value={referralCode}
                  maxLength={6}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="Enter your referrer’s ID"
                  style={styles.input}
                  disabled={isProcessing}
                />
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
                <span style={styles.hint}>Used to authorize withdrawals from your account.</span>
                <span style={styles.dangerText}>Do not share this code with anyone.</span>
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
                onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = colors.accentDark; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = colors.accent; }}
              >
                Register Now — {config.registrationFee} USDT
              </button>
              <div style={styles.smallNote}>
                By proceeding, you confirm this one‑time anti‑spam fee and agree to our community guidelines.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Register;