// frontend/src/components/UserMenu.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '../context/WalletContext';

const colors = {
  deepNavy: '#0b1b3b',
  navySoft: '#163057',
  white: '#ffffff',
  line: 'rgba(11,27,59,0.10)',
  accent: '#14b8a6',
  danger: '#b91c1c',
};

type Props = {
  userId?: string;
  address?: string;
  onLogout?: () => void;
};

const box: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block',
};

const avatarBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  background: 'rgba(11,27,59,0.12)',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 900,
  color: colors.deepNavy,
  border: `1px solid ${colors.line}`,
  cursor: 'pointer',
  userSelect: 'none',
};

const menuWrap: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 8px)',
  minWidth: 220,
  background: 'rgba(255,255,255,0.98)',
  border: `1px solid ${colors.line}`,
  borderRadius: 12,
  boxShadow: '0 12px 28px rgba(11,27,59,0.1)',
  overflow: 'hidden',
  zIndex: 50,
};

const item: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  fontSize: 14,
  color: colors.deepNavy,
  cursor: 'pointer',
  borderBottom: `1px solid ${colors.line}`,
  background: colors.white,
};

const itemDanger: React.CSSProperties = { ...item, color: colors.danger, fontWeight: 700 };

const header: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: `1px solid ${colors.line}`,
  background: 'rgba(255,255,255,0.85)',
};

const small: React.CSSProperties = { fontSize: 12, color: colors.navySoft, opacity: 0.9 };

const buttonText: React.CSSProperties = { flex: 1 };

const UserMenu: React.FC<Props> = ({ userId, address, onLogout }) => {
  const { account, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const resolvedAddress = useMemo(() => address || account || '', [address, account]);
  const resolvedCode = useMemo(() => (userId || '').toUpperCase(), [userId]);

  const initials = useMemo(() => {
    if (resolvedCode) return resolvedCode.slice(0, 2);
    if (resolvedAddress) return resolvedAddress.slice(2, 4).toUpperCase();
    return 'U';
  }, [resolvedCode, resolvedAddress]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      const target = e.target as Node;
      if (!ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Tiny visual feedback (no toast dependency here)
      const el = ref.current;
      if (el) {
        el.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 250 });
      }
    } catch {}
  };

  const doLogout = () => {
    if (onLogout) onLogout();
    else disconnect();
    setOpen(false);
  };

  return (
    <div ref={ref} style={box}>
      <button
        type="button"
        style={avatarBtn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="User menu"
      >
        {initials}
      </button>

      {open && (
        <div role="menu" style={menuWrap}>
          <div style={header}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>
              {resolvedCode || 'User'}
            </div>
            <div style={small}>
              {resolvedAddress
                ? `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}`
                : 'No wallet connected'}
            </div>
          </div>

          {resolvedCode && (
            <div
              role="menuitem"
              style={item}
              onClick={() => copy(resolvedCode)}
              title="Copy referral code"
            >
              <span style={buttonText}>Copy referral code</span>
              <kbd style={{ fontSize: 11, background: 'rgba(20,184,166,0.12)', padding: '2px 6px', borderRadius: 6, color: colors.accent }}>
                CODE
              </kbd>
            </div>
          )}

          {resolvedAddress && (
            <div
              role="menuitem"
              style={item}
              onClick={() => copy(resolvedAddress)}
              title="Copy wallet address"
            >
              <span style={buttonText}>Copy wallet address</span>
              <kbd style={{ fontSize: 11, background: 'rgba(20,184,166,0.12)', padding: '2px 6px', borderRadius: 6, color: colors.accent }}>
                0x
              </kbd>
            </div>
          )}

          <a
            href="/info"
            style={{ ...item, textDecoration: 'none' }}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span style={buttonText}>Info page</span>
          </a>

          <div role="menuitem" style={itemDanger} onClick={doLogout} title="Logout">
            <span style={buttonText}>Logout</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
