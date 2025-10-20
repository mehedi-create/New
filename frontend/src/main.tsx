import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider } from './context/WalletContext'
import AppRouter from './Router'

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000, gcTime: 5 * 60_000 },
    mutations: { retry: 0 },
  },
})

// Cookie helpers
function setCookie(name: string, value: string, days = 365) {
  const maxAge = days * 24 * 60 * 60
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}
function getCookie(name: string): string | null {
  const key = `${encodeURIComponent(name)}=`
  const parts = document.cookie.split('; ')
  for (const p of parts) if (p.startsWith(key)) return decodeURIComponent(p.substring(key.length))
  return null
}

// Global theme CSS (unchanged)
const THEME_CSS = `
:root{
  --deep:#0b1b3b; --soft:#163057; --accent:#14b8a6; --accentSoft:#e0f5ed;
  --text:#e8f9f1; --muted:rgba(232,249,241,.75); --line:rgba(255,255,255,.12);
}

/* Base layout fix: prevent white gap on long scroll/overscroll */
html, body { min-height: 100%; height: auto; margin: 0; background-color: var(--deep); overscroll-behavior-y: none; }
#root { min-height: 100%; }

/* Fixed gradient layer behind everything */
.theme-lexori::before{
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: linear-gradient(135deg, var(--deep) 0%, var(--soft) 30%, var(--deep) 70%, var(--soft) 100%);
}

/* Text color base */
.theme-lexori, .theme-lexori body, .theme-lexori #root { color: var(--text); }

/* Brand gradient text */
.lxr-lexori-logo{
  background: linear-gradient(45deg, var(--accent), #e8f9f1, var(--accent));
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  text-shadow: 0 0 30px rgba(20,184,166,0.5);
}

/* Reusable surface */
.lxr-surface{
  position:relative; overflow:hidden; border-radius:16px; padding:14px; width:100%; color:var(--text);
  background:
    radial-gradient(circle at 20% 20%, rgba(20,184,166,0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(232,249,241,0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 60%, rgba(22,48,87,0.2) 0%, transparent 50%),
    linear-gradient(135deg, var(--deep) 0%, var(--soft) 30%, var(--deep) 70%, var(--soft) 100%);
  box-shadow: 0 15px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 0 50px rgba(20,184,166,0.05);
  border: 1px solid rgba(20,184,166,0.2);
}
.lxr-surface-lines,.lxr-surface-mesh,.lxr-surface-circuit{ position:absolute; inset:0; pointer-events:none; }
.lxr-surface-lines{
  opacity:.15; background-image:
  radial-gradient(circle at 20% 30%, var(--accent) 2px, transparent 2px),
  radial-gradient(circle at 80% 70%, #e8f9f1 2px, transparent 2px),
  radial-gradient(circle at 60% 20%, var(--soft) 2px, transparent 2px),
  radial-gradient(circle at 40% 80%, var(--accent) 1px, transparent 1px),
  radial-gradient(circle at 90% 30%, var(--accentSoft) 1px, transparent 1px);
  background-size: 60px 60px, 80px 80px, 70px 70px, 40px 40px, 50px 50px;
}
.lxr-surface-mesh{
  opacity:.08; background-image:
  linear-gradient(30deg, transparent 40%, rgba(20,184,166,0.3) 41%, rgba(20,184,166,0.3) 42%, transparent 43%),
  linear-gradient(150deg, transparent 40%, rgba(232,249,241,0.3) 41%, rgba(232,249,241,0.3) 42%, transparent 43%),
  linear-gradient(90deg, transparent 40%, rgba(22,48,87,0.3) 41%, rgba(22,48,87,0.3) 42%, transparent 43%);
  background-size: 120px 120px, 100px 100px, 80px 80px;
}
.lxr-surface-circuit{ opacity:.2; background-image: linear-gradient(90deg, rgba(20,184,166,0.1) 1px, transparent 1px), linear-gradient(rgba(20,184,166,0.1) 1px, transparent 1px); background-size: 20px 20px; }
.lxr-surface-holo{ position:absolute; top:0; left:0; height:4px; width:100%; background: linear-gradient(90deg, transparent 0%, rgba(20,184,166,0.35) 25%, rgba(232,249,241,0.35) 50%, rgba(224,245,237,0.35) 75%, transparent 100%); }

/* Mining card */
.lxr-mining-card{
  position:relative; overflow:hidden; border-radius:16px; padding:16px; width:100%; max-width:380px; aspect-ratio:1.586;
  background:
    radial-gradient(circle at 20% 20%, rgba(20,184,166,0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(232,249,241,0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 60%, rgba(22,48,87,0.2) 0%, transparent 50%),
    linear-gradient(135deg, var(--deep) 0%, var(--soft) 30%, var(--deep) 70%, var(--soft) 100%);
  box-shadow: 0 15px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 0 50px rgba(20,184,166,0.05);
  border: 1px solid rgba(20,184,166,0.2);
}
.lxr-network-lines, .lxr-crypto-mesh, .lxr-circuit { position:absolute; inset:0; pointer-events:none; }
.lxr-network-lines{
  opacity:.15; background-image:
  radial-gradient(circle at 20% 30%, var(--accent) 2px, transparent 2px),
  radial-gradient(circle at 80% 70%, #e8f9f1 2px, transparent 2px),
  radial-gradient(circle at 60% 20%, var(--soft) 2px, transparent 2px),
  radial-gradient(circle at 40% 80%, var(--accent) 1px, transparent 1px),
  radial-gradient(circle at 90% 30%, var(--accentSoft) 1px, transparent 1px);
  background-size: 60px 60px, 80px 80px, 70px 70px, 40px 40px, 50px 50px;
}
.lxr-crypto-mesh{
  opacity:.08; background-image:
  linear-gradient(30deg, transparent 40%, rgba(20,184,166,0.3) 41%, rgba(20,184,166,0.3) 42%, transparent 43%),
  linear-gradient(150deg, transparent 40%, rgba(232,249,241,0.3) 41%, rgba(232,249,241,0.3) 42%, transparent 43%),
  linear-gradient(90deg, transparent 40%, rgba(22,48,87,0.3) 41%, rgba(22,48,87,0.3) 42%, transparent 43%);
  background-size: 120px 120px, 100px 100px, 80px 80px;
}
.lxr-circuit{ opacity:.2; background-image: linear-gradient(90deg, rgba(20,184,166,0.1) 1px, transparent 1px), linear-gradient(rgba(20,184,166,0.1) 1px, transparent 1px); background-size: 20px 20px; }

.lxr-panel { background:rgba(0,0,0,0.3); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; }
.lxr-quantity{ width:100%; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:2px solid rgba(20,184,166,0.3); color:#fff; font-weight:700; font-size:15px; transition:all .2s ease; }
.lxr-quantity:focus{ background:rgba(255,255,255,0.1); border-color:var(--accent); outline:none; box-shadow:0 0 12px rgba(20,184,166,0.25); }
.lxr-quantity.lxr-invalid{ border-color:#ef4444; box-shadow:0 0 12px rgba(239,68,68,0.25); }
.lxr-buy-btn{ min-width:130px; padding:10px 16px; border-radius:10px; border:none; font-weight:800; color:#0b1b3b; background:linear-gradient(45deg, var(--accent), var(--accentSoft)); box-shadow:0 4px 15px rgba(20,184,166,0.3); cursor:pointer; transition:background .2s ease, opacity .2s ease; }
.lxr-buy-btn:hover{ background:linear-gradient(45deg, var(--accentSoft), var(--accent)); }
.lxr-buy-btn:disabled{ opacity:.7; filter:grayscale(0.2); cursor:not-allowed; }
`

function GlobalLexoriTheme() {
  React.useEffect(() => {
    const theme = getCookie('theme') || 'lexori'
    document.documentElement.classList.add(`theme-${theme}`)
    if (!getCookie('theme')) setCookie('theme', theme, 365)
  }, [])
  return <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
}

// Global Error Boundary (prevents white screen)
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, message: '' }
  }
  static getDerivedStateFromError(error: any) {
    const msg = (error && (error.message || String(error))) || 'Unknown runtime error'
    return { hasError: true, message: msg }
  }
  componentDidCatch(error: any, info: any) {
    console.error('AppErrorBoundary caught:', error, info)
  }
  reload = () => window.location.reload()
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0b1b3b, #163057)',
            color: '#e8f9f1',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              padding: 16,
              background: 'rgba(11,27,59,0.35)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.9 }}>
              {this.state.message}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={this.reload}
                style={{
                  height: 40,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 14px',
                  fontWeight: 800,
                  background: 'linear-gradient(45deg, #14b8a6, #e0f5ed)',
                  color: '#0b1b3b',
                }}
              >
                Reload
              </button>
              <a
                href="https://reactjs.org/docs/error-decoder.html?invariant=300"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  height: 40,
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontWeight: 800,
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#e8f9f1',
                  textDecoration: 'none',
                }}
              >
                React error #300 help
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Global listeners to log issues
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('Global window error:', e?.error || e?.message || e)
  })
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Global unhandledrejection:', e?.reason || e)
  })
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root container not found. Ensure <div id="root"></div> exists in index.html')
}

ReactDOM.createRoot(rootEl).render(
  // StrictMode রাখলে ডেভেলপমেন্টে কিছু কম্পোনেন্ট দুইবার মাউন্ট হতে পারে; সমস্যা হলে সাময়িকভাবে সরিয়ে দেখুন।
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <GlobalLexoriTheme />
          <AppRouter />
        </WalletProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>
)
