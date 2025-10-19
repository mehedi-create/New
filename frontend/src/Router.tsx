import React, { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useWallet } from './context/WalletContext'
import AdminDashboard from './pages/AdminDashboard'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))

const Loader: React.FC<{ text?: string }> = ({ text = 'Loading…' }) => (
  <div
    style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      color: '#163057',
    }}
  >
    {text}
  </div>
)

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as any })
  }, [pathname])
  return null
}

// Require wallet + registered status for user dashboard
const RequireRegistered: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { account, onChainStatus, isCheckingStatus, refreshStatus } = useWallet()

  useEffect(() => {
    if (account && onChainStatus === 'unregistered') {
      refreshStatus().catch(() => {})
    }
  }, [account, onChainStatus, refreshStatus])

  if (!account) return <Navigate to="/login" replace />
  if (isCheckingStatus || onChainStatus === 'checking') return <Loader text="Checking on-chain status…" />
  if (onChainStatus !== 'registered') return <Navigate to="/register" replace />
  return children
}

// Simple wallet-protected wrapper (AdminDashboard নিজেই admin/owner guard করে)
const Protected: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { account } = useWallet()
  if (!account) return <Navigate to="/login" replace />
  return children
}

const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/dashboard"
            element={
              <RequireRegistered>
                <Dashboard />
              </RequireRegistered>
            }
          />

          <Route
            path="/admin"
            element={
              <Protected>
                <AdminDashboard />
              </Protected>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default AppRouter
