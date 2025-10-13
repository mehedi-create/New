// frontend/src/Router.tsx
import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useWallet } from './context/WalletContext';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

const colors = {
  bgLightGreen: '#e8f9f1',
  bgLightGreen2: '#e0f5ed',
  deepNavy: '#0b1b3b',
  navySoft: '#163057',
};

const appShellStyle: React.CSSProperties = {
  minHeight: '100vh',
  width: '100%',
  background: `linear-gradient(180deg, ${colors.bgLightGreen} 0%, ${colors.bgLightGreen2} 100%)`,
  color: colors.deepNavy,
};

const LoadingScreen: React.FC = () => (
  <div
    style={{
      ...appShellStyle,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontSize: '1.05rem',
    }}
  >
    Checking status...
  </div>
);

export const AppRouter: React.FC = () => {
  const { account, onChainStatus, isCheckingStatus } = useWallet();

  // Global: block copy/cut/select/context menu/drag; apply global colors
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();

    document.addEventListener('copy', prevent);
    document.addEventListener('cut', prevent);
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('selectstart', prevent);
    document.addEventListener('dragstart', prevent);

    // apply body styles
    const prev = {
      bg: document.body.style.background,
      color: document.body.style.color,
      userSelect: (document.body.style as any).userSelect,
      webkitUserSelect: (document.body.style as any).webkitUserSelect,
      mozUserSelect: (document.body.style as any).MozUserSelect,
      msUserSelect: (document.body.style as any).msUserSelect,
    };
    document.body.style.background = `linear-gradient(180deg, ${colors.bgLightGreen} 0%, ${colors.bgLightGreen2} 100%)`;
    document.body.style.color = colors.deepNavy;
    (document.body.style as any).userSelect = 'none';
    (document.body.style as any).webkitUserSelect = 'none';
    (document.body.style as any).MozUserSelect = 'none';
    (document.body.style as any).msUserSelect = 'none';

    return () => {
      document.removeEventListener('copy', prevent);
      document.removeEventListener('cut', prevent);
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('selectstart', prevent);
      document.removeEventListener('dragstart', prevent);

      document.body.style.background = prev.bg;
      document.body.style.color = prev.color;
      (document.body.style as any).userSelect = prev.userSelect;
      (document.body.style as any).webkitUserSelect = prev.webkitUserSelect;
      (document.body.style as any).MozUserSelect = prev.mozUserSelect;
      (document.body.style as any).msUserSelect = prev.msUserSelect;
    };
  }, []);

  if (isCheckingStatus) {
    return <LoadingScreen />;
  }

  return (
    <div style={appShellStyle}>
      <Routes>
        <Route
          path="/"
          element={
            !account ? (
              <Login />
            ) : onChainStatus === 'registered' ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/register" replace />
            )
          }
        />
        <Route
          path="/register"
          element={
            !account ? (
              <Navigate to="/" replace />
            ) : onChainStatus === 'registered' ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Register />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            !account ? (
              <Navigate to="/" replace />
            ) : onChainStatus === 'unregistered' ? (
              <Navigate to="/register" replace />
            ) : (
              <Dashboard />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};
