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
  dot: 'rgba(255,255,255,0.25)',
  dotActive: '#14b8a6',
  border: 'rgba(255,255,255,0.35)',
}

const styles: Record<string, React.CSSProperties> = {
  shell: { background: 'transparent', border: 'none', padding: 0 },
  wrap: { position: 'relative', overflow: 'hidden', borderRadius: 16 },

  // Header নেই, তাই শুধু কন্টেন্ট + ডটস
  body: { padding: '6px 6px 0' }, // চারপাশে ন্যূনতম গ্যাপ
  viewport: {
    width: '100%',
    height: 'clamp(240px, 54vw, 460px)', // মোবাইল থেকে ডেস্কটপ পর্যন্ত রেসপনসিভ
  },
  contentBox: {
    width: '100%',
    height: '100%',
    border: `3px solid ${colors.border}`, // 3px বর্ডার
    borderRadius: 12,
    overflow: 'hidden',
    background: 'rgba(0,0,0,0.35)',
    display: 'grid',
    placeItems: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover', // ফুল-এলাকা জুড়ে
    display: 'block',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    background: 'transparent',
  },

  // Dots: কেবল নিচে অল্প জায়গা
  dotsWrap: { padding: '4px 0 8px', display: 'flex', justifyContent: 'center' },
  dots: { display: 'flex', gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 8, background: colors.dot, cursor: 'pointer' },
  dotActive: { background: colors.dotActive, width: 18 },
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

// Error boundary যাতে স্লাইডার ফেইল করলেও পুরো পেজ ব্ল্যাঙ্ক না হয়
class SliderBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: any) { console.error('NoticeCarousel error:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="lxr-surface" style={{ padding: 10, borderRadius: 16 }}>
          <div className="lxr-surface-lines" />
          <div className="lxr-surface-mesh" />
          <div className="lxr-surface-circuit" />
          <div className="lxr-surface-holo" />
          <div style={{ position: 'relative', zIndex: 2, color: 'rgba(232,249,241,0.75)', textAlign: 'center' }}>
            Announcements unavailable
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const BASE = (config.apiBaseUrl || '').replace(/\/+$/, '')

const NoticeCarousel: React.FC<{ autoIntervalMs?: number; limit?: number }> = ({ autoIntervalMs = 5000, limit = 10 }) => {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`${BASE}/api/notices?active=1&limit=${Math.min(Math.max(limit || 10, 1), 50)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return
        const all: Notice[] = Array.isArray(data?.notices) ? data.notices : []
        const filtered = all.filter((n) =>
          n && (n.kind === 'image' || n.kind === 'script') &&
          ((n.kind === 'image' && (n.image_url || '').trim()) || (n.kind === 'script' && (n.content_html || '').trim()))
        )
        setNotices(filtered)
        setIndex(0)
      })
      .catch((e) => { console.error('Failed to load notices:', e); setNotices([]) })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [limit])

  const count = notices.length
  useEffect(() => { if (index >= count && count > 0) setIndex(0) }, [count, index])

  const go = (i: number) => setIndex((i + count) % count)
  const next = () => go(index + 1)

  // Hover pause
  const hoverRef = useRef(false)
  const onEnter = () => { hoverRef.current = true }
  const onLeave = () => { hoverRef.current = false }

  // Auto-slide
  useEffect(() => {
    if (count <= 1) return
    const id = setInterval(() => { if (!hoverRef.current) next() }, autoIntervalMs)
    return () => clearInterval(id)
  }, [count, index, autoIntervalMs])

  // Touch swipe only (no arrows)
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) { if (dx < 0) next(); else go(index - 1) }
    touchStartX.current = null
  }

  const active = notices[index]

  // image fallback: first try direct url; if fails, try proxy once
  const [imgFailedOnce, setImgFailedOnce] = useState(false)
  useEffect(() => { setImgFailedOnce(false) }, [index, count])

  const buildImgSrc = (url?: string) => {
    const u = (url || '').trim()
    if (!u) return ''
    if (!imgFailedOnce) return u // try direct first
    // fallback to proxy (only if backend has it; onError আবার হলে কিছু করার নেই)
    return `${BASE}/api/notice-img?src=${encodeURIComponent(u)}`
  }

  // Script iframe HTML (sandboxed)
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
          <div
            style={styles.wrap}
          >
            <div
              style={styles.body}
              onMouseEnter={onEnter}
              onMouseLeave={onLeave}
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
                        const src = buildImgSrc(active.image_url)
                        const img = (
                          <img
                            src={src}
                            alt="notice"
                            style={styles.img}
                            onError={() => setImgFailedOnce(true)}
                          />
                        )
                        return active.link_url ? (
                          <a href={active.link_url} target="_blank" rel="noopener noreferrer" style={{ display: 'contents' }}>
                            {img}
                          </a>
                        ) : img
                      })()
                    ) : (
                      <iframe
                        title={`notice-script-${active.id}`}
                        sandbox="allow-scripts allow-popups"
                        srcDoc={scriptHtml}
                        style={styles.iframe}
                        referrerPolicy="no-referrer"
                      />
                    )
                  ) : null}
                </div>
              </div>

              {/* Only dots below, small space */}
              {count > 1 && (
                <div style={styles.dotsWrap}>
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
                </div>
              )}
            </div>
          </div>
        </Surface>
      </div>
    </SliderBoundary>
  )
}

export default NoticeCarousel
