import React, { useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../config'

type Notice = {
  id: number
  title?: string
  content_html?: string
  image_url?: string
  link_url?: string
  kind?: 'image' | 'script'
  priority?: number
  created_at?: string
}

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  line: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
}

const styles: Record<string, React.CSSProperties> = {
  shell: { background: 'transparent', border: 'none', padding: 0 },
  wrap: { position: 'relative', overflow: 'hidden', borderRadius: 16 },

  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.line}`, // চিকন দাগ
    color: colors.text,
  },
  title: { fontWeight: 900, fontSize: 14 },
  small: { fontSize: 12, color: colors.textMuted },

  // Header-এর নিচের পুরো জায়গা নোটিশ দেখানোর জন্য
  body: {
    padding: 10,
  },
  viewport: {
    width: '100%',
    height: 'clamp(220px, 52vw, 420px)', // মোবাইল-ডেস্কটপ রেসপনসিভ হাইট
  },
  contentBox: {
    width: '100%',
    height: '100%',
    border: '3px solid rgba(255,255,255,0.25)', // 3px বর্ডার
    borderRadius: 12,
    overflow: 'hidden',
    background: 'rgba(0,0,0,0.35)',
    display: 'grid',
    placeItems: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover', // জোরে/ফুল এরিয়া ভরবে
    display: 'block',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    background: 'transparent',
  },

  dots: { display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '8px 0' },
  dot: { width: 8, height: 8, borderRadius: 8, background: 'rgba(255,255,255,0.25)', cursor: 'pointer' },
  dotActive: { background: colors.accent, width: 18 },

  arrow: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center',
    background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.line}`,
    cursor: 'pointer', userSelect: 'none' as const,
  },
  arrowLeft: { left: 8 },
  arrowRight: { right: 8 },
}

const Surface: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div className="lxr-surface" style={style}>
    <div className="lxr-surface-lines" />
    <div className="lxr-surface-mesh" />
    <div className="lxr-surface-circuit" />
    <div className="lxr-surface-holo" />
    <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
  </div>
)

const IconArrow: React.FC<{ dir: 'left' | 'right'; size?: number }> = ({ dir, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {dir === 'left'
      ? <path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      : <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>
)

// Local error boundary (যাতে স্লাইডার ভাঙলেও পেজ সাদা না হয়)
class SliderBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: any) { console.error('NoticeCarousel error:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="lxr-surface">
          <div className="lxr-surface-lines" />
          <div className="lxr-surface-mesh" />
          <div className="lxr-surface-circuit" />
          <div className="lxr-surface-holo" />
          <div style={{ position: 'relative', zIndex: 2, padding: 10, color: colors.textMuted }}>
            Announcements unavailable
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const BASE = (config.apiBaseUrl || '').replace(/\/+$/, '')

function proxiedImg(src?: string) {
  const url = (src || '').trim()
  if (!url) return ''
  // http/https হলে প্রোক্সির মাধ্যমে লোড হবে (mixed content/hotlink fix)
  if (/^https?:\/\//i.test(url)) return `${BASE}/api/notice-img?src=${encodeURIComponent(url)}`
  // data URL বা relative হলে 그대로
  return url
}

const NoticeCarousel: React.FC<{ autoIntervalMs?: number; limit?: number }> = ({ autoIntervalMs = 5000, limit = 10 }) => {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)

  // Fetch notices
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`${BASE}/api/notices?active=1&limit=${Math.min(Math.max(limit || 10, 1), 50)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return
        const all: Notice[] = Array.isArray(data?.notices) ? data.notices : []
        // শুধু image + script রাখতে বলা হয়েছে
        const filtered = all.filter((n) =>
          n && (n.kind === 'image' || n.kind === 'script') &&
          ((n.kind === 'image' && (n.image_url || '').trim()) || (n.kind === 'script' && (n.content_html || '').trim()))
        )
        setNotices(filtered)
        setIndex(0)
      })
      .catch((e) => {
        console.error('Failed to load notices:', e)
        setNotices([])
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [limit])

  const count = notices.length
  useEffect(() => { if (index >= count && count > 0) setIndex(0) }, [count, index])

  const go = (i: number) => setIndex((i + count) % count)
  const next = () => go(index + 1)
  const prev = () => go(index - 1)

  // Hover pause
  const hoverRef = useRef(false)
  const onMouseEnter = () => { hoverRef.current = true }
  const onMouseLeave = () => { hoverRef.current = false }

  // Auto-slide
  useEffect(() => {
    if (count <= 1) return
    const id = setInterval(() => { if (!hoverRef.current) next() }, autoIntervalMs)
    return () => clearInterval(id)
  }, [count, index, autoIntervalMs])

  // Touch swipe
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) { if (dx < 0) next(); else prev() }
    touchStartX.current = null
  }

  const active = notices[index]

  // Script iframe HTML
  const scriptHtml = useMemo(() => {
    if (!active || active.kind !== 'script') return ''
    const content = String(active.content_html || '')
    return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>html,body{margin:0;padding:0;background:transparent;color:#fff;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial}</style>
</head><body>${content}</body></html>`
  }, [active])

  if (!loading && count === 0) return null

  return (
    <SliderBoundary>
      <div style={styles.shell}>
        <Surface>
          <div style={styles.wrap}>
            <div style={styles.header}>
              <div style={styles.title}>Announcements</div>
              {active?.created_at && <div style={styles.small}>{new Date(active.created_at).toLocaleString()}</div>}
            </div>

            {/* Header-এর নিচের পুরো অংশ */}
            <div
              style={styles.body}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <div style={styles.viewport}>
                <div style={styles.contentBox}>
                  {loading ? (
                    <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.06)' }} />
                  ) : active ? (
                    active.kind === 'image' ? (
                      (() => {
                        const src = proxiedImg(active.image_url)
                        const imageEl = <img src={src} alt={active.title || 'notice'} style={styles.img} />
                        return active.link_url ? (
                          <a
                            href={active.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'contents' }}
                          >
                            {imageEl}
                          </a>
                        ) : imageEl
                      })()
                    ) : active.kind === 'script' ? (
                      <iframe
                        title={`notice-script-${active.id}`}
                        sandbox="allow-scripts allow-popups"
                        srcDoc={scriptHtml}
                        style={styles.iframe}
                        referrerPolicy="no-referrer"
                      />
                    ) : null
                  ) : null}
                </div>
              </div>

              {/* Controls */}
              {count > 1 && (
                <>
                  <button type="button" aria-label="Previous" style={{ ...styles.arrow, ...styles.arrowLeft }} onClick={prev}>
                    <IconArrow dir="left" />
                  </button>
                  <button type="button" aria-label="Next" style={{ ...styles.arrow, ...styles.arrowRight }} onClick={next}>
                    <IconArrow dir="right" />
                  </button>
                  <div style={styles.dots}>
                    {notices.map((_, i) => (
                      <div
                        key={i}
                        style={{ ...styles.dot, ...(i === index ? styles.dotActive : {}) }}
                        onClick={() => go(i)}
                        aria-label={`Go to notice ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </Surface>
      </div>
    </SliderBoundary>
  )
}

export default NoticeCarousel
