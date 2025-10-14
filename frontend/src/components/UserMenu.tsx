// frontend/src/components/UserMenu.tsx
import React, { useState } from 'react'
import { useWallet } from '../context/WalletContext'

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'relative', display: 'inline-block' },
  btn: {
    height: 36, borderRadius: 10, padding: '0 12px',
    border: '1px solid rgba(11,27,59,0.15)',
    background: 'rgba(255,255,255,0.7)', fontWeight: 700, cursor: 'pointer',
  },
  menu: {
    position: 'absolute', right: 0, top: '110%',
    background: '#fff', border: '1px solid rgba(11,27,59,0.12)',
    borderRadius: 10, boxShadow: '0 8px 18px rgba(11,27,59,0.08)',
    minWidth: 220, padding: 8, zIndex: 20,
  },
  item: {
    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
  },
}

const UserMenu: React.FC = () => {
  const { account, disconnect } = useWallet()
  const [open, setOpen] = useState(false)
  const short = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Wallet'

  const copy = async () => {
    if (!account) return
    await navigator.clipboard.writeText(account)
    setOpen(false)
  }

  return (
    <div style={styles.wrap}>
      <button style={styles.btn} onClick={() => setOpen((v) => !v)}>{short}</button>
      {open && (
        <div style={styles.menu} onMouseLeave={() => setOpen(false)}>
          <div style={styles.item} onClick={copy}>Copy address</div>
          <div style={styles.item} onClick={() => setOpen(false)}>Close</div>
          <div style={{ ...styles.item, color: '#b91c1c' }} onClick={disconnect}>Logout</div>
        </div>
      )}
    </div>
  )
}

export default UserMenu
