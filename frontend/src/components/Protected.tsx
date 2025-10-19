// frontend/src/components/Protected.tsx
import React from 'react'
import { Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { isValidAddress } from '../utils/wallet'

const Protected: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { account } = useWallet()
  if (!isValidAddress(account)) return <Navigate to="/login" replace />
  return children
}

export default Protected
