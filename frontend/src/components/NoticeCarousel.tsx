import React, { useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../config'

// Only these two kinds are allowed
type Notice = {
  id: number
  kind: 'image' | 'script'
  image_url?: string
  link_url?: string
  content_html?: string
  created_at?: string
}

const colors = {
  border: 'rgba(255,255,255,0.35)',
  dot: 'rgba(255,255,255,0.25)',
  dotActive: '#14b8a6',
}

const styles: Record<string, React.CSSProperties> = {
  shell: { background: 'transparent', border: 'none', padding: 0 },
  wrap: { position: 'relative', overflow: 'hidden', borderRadius: 16 },

  // 16:9 area (full width), the notice will occupy this whole area
  ratioBox: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9', // 16:9 fixed
  },
  contentBox: {
    position: 'absolute',
    inset: 0,
    border: `3px solid ${colors.border}`, // 3px border as requested
    borderRadius: 12,
    overflow: 'hidden',
    background: 'rgba(0,0,0,0.35)',
    display: 'grid',
    placeItems: 'center',
  },
  // Fill the entire area
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  iframe: { width: '100%', height: '100%', border: 'none', background: 'transparent' },

  // Just small space for dots below
  dotsWrap: { padding: '6px 0 8px', display: 'flex', justifyContent: 'center' },
  dots: { display: 'flex', gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 8, background: colors.dot, cursor: 'pointer' },
  dotActive: { background: colors.dotActive, width: 18 },
}

// Local error boundary: the slider never crashes the page
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

  // Fetch active notices (image + script only)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`${BASE}/api/notices?active=1&limit=${Math.min(Math.max(limit || 10, 1), 50)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return
        const all: any[] = Array.isArray(data?.notices) ? data.notices : []
        const filtered: Notice[] = all
          .filter((n) =>
            n &&
            (n.kind === 'image' || n.kind === 'script') &&
            ((n.kind === 'image' && (n.image_url || '').trim()) ||
              (n.kind === 'script' && (n.content_html || '').trim()))
          )
          .map((n) => ({
            id: Number(n.id),
            kind: n.kind,
            image_url: n.image_url || '',
            link_url: n.link_url || '',
            content_html: n.content_html || '',
            created_at: n.created_at || '',
          }))
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

  // Hover pause
  const hoverRef = useRef(false)
  const onEnter = () => { hoverRef.current = true }
  const onLeave = () => { hoverRef.current = false }

  // Auto-slide (no arrows)
  useEffect(() => {
    if (count <= 1) return
    const id = setInterval(() => { if (!hoverRef.current) next() }, autoIntervalMs)
    return () => clearInterval(id)
  }, [count, index, autoIntervalMs])

  // Touch swipe only
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) { if (dx < 0) next(); else go(index - 1) }
    touchStartX.current = null
  }

  const active = notices[index]

  // Image: first try direct, if fails, fallback to backend proxy (if available)
  const [imgFailedOnce, setImgFailedOnce] = useState(false)
  useEffect(() => { setImgFailedOnce(false) }, [index])
  const buildImgSrc = (url?: string) => {
    const u = (url || '').trim()
    if (!u) return ''
    if (!imgFailedOnce) return u
    return `${BASE}/api/notice-img?src=${encodeURIComponent(u)}`
  }

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
      <div className="lxr-surface" style={{ padding: 8, borderRadius: 16 }}>
        <div className="lxr-surface-lines" />
        <div className="lxr-surface-mesh" />
        <div className="lxr-surface-circuit" />
        <div className="lxr-surface-holo" />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div
            style={styles.wrap}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* 16:9 full area */}
            <div style={styles.ratioBox}>
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

            {/* Only dots below */}
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
      </div>
    </SliderBoundary>
  )
}

export default NoticeCarousel
