// frontend/src/utils/notification.ts
// Lightweight, dependency-free toast notifications (mobile friendly)

type ToastType = 'success' | 'error' | 'info'

let container: HTMLElement | null = null
let styleInjected = false

function ensureContainer() {
  if (container) return container
  container = document.createElement('div')
  container.id = 'toast-container'
  container.style.position = 'fixed'
  container.style.top = '14px'
  container.style.left = '50%'
  container.style.transform = 'translateX(-50%)'
  container.style.display = 'grid'
  container.style.gap = '8px'
  container.style.zIndex = '9999'
  container.style.width = 'min(92vw, 520px)'
  container.setAttribute('aria-live', 'polite')
  document.body.appendChild(container)
  return container
}

function injectStyles() {
  if (styleInjected) return
  styleInjected = true
  const css = `
  .toast {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    align-items: start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(11,27,59,0.12);
    background: rgba(255,255,255,0.96);
    color: #0b1b3b;
    box-shadow: 0 10px 24px rgba(11,27,59,0.10);
    font-size: 14px;
    animation: toast-in 180ms ease-out forwards;
  }
  .toast.success { border-color: rgba(22,163,74,0.25); }
  .toast.error { border-color: rgba(185,28,28,0.25); }
  .toast.info { border-color: rgba(20,184,166,0.25); }

  .toast .dot {
    width: 12px; height: 12px; border-radius: 50%;
    margin-top: 3px;
  }
  .toast.success .dot { background: #16a34a; }
  .toast.error .dot { background: #b91c1c; }
  .toast.info .dot { background: #14b8a6; }

  .toast .msg { line-height: 1.35; }
  .toast .close {
    margin-left: 8px;
    border: 0; background: transparent; color: #163057;
    font-weight: 900; font-size: 16px; cursor: pointer;
    opacity: 0.7;
  }
  .toast .close:hover { opacity: 1; }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes toast-out {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-6px); }
  }
  `
  const style = document.createElement('style')
  style.id = 'toast-styles'
  style.textContent = css
  document.head.appendChild(style)
}

function normalizeMessage(input: any, fallback?: string): string {
  if (!input && fallback) return fallback
  if (typeof input === 'string') return input
  if (input?.message && typeof input.message === 'string') return input.message
  // Axios-like error shape
  const msg =
    input?.response?.data?.error ||
    input?.response?.data?.message ||
    input?.data?.error ||
    input?.data?.message ||
    fallback
  return typeof msg === 'string' && msg.length ? msg : 'Something went wrong'
}

function createToast(type: ToastType, message: string, duration = 3000) {
  injectStyles()
  const root = ensureContainer()

  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.setAttribute('role', 'status')
  el.innerHTML = `
    <div class="dot"></div>
    <div class="msg">${escapeHtml(message)}</div>
    <button class="close" aria-label="Close">&times;</button>
  `

  const closeBtn = el.querySelector('.close') as HTMLButtonElement
  const remove = () => {
    el.style.animation = 'toast-out 160ms ease-in forwards'
    setTimeout(() => {
      if (el.parentElement) el.parentElement.removeChild(el)
    }, 170)
  }

  closeBtn?.addEventListener('click', remove)

  // Auto-remove after duration (longer for errors)
  const ttl = type === 'error' ? Math.max(duration, 4000) : duration
  const t = setTimeout(remove, ttl)
  el.addEventListener('mouseenter', () => clearTimeout(t))

  root.appendChild(el)
}

// Escape minimal HTML (prevent injection)
function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// Public helpers
export function showSuccessToast(message: string) {
  createToast('success', message, 2200)
}

export function showInfoToast(message: string) {
  createToast('info', message, 2400)
}

export function showErrorToast(err: any, fallback?: string) {
  const msg = normalizeMessage(err, fallback)
  createToast('error', msg, 4200)
}
