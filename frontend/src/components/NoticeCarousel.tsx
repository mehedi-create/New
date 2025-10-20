import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getNotices } from '../services/api'

type Notice = {
  id: number
  title?: string
  content_html?: string
  image_url?: string
  link_url?: string
  kind?: 'image' | 'text' | 'script'
  priority?: number
  created_at?: string
}

const colors = {
  text: '#e8f9f1',
  textMuted: 'rgba(232,249,241,0.75)',
  grayLine: 'rgba(255,255,255,0.12)',
  accent: '#14b8a6',
}

const styles: Record<string, React.CSSProperties> = {
  shell: { background: 'transparent', border: 'none', padding: 0 },
  wrap: { position: 'relative', overflow: 'hidden', borderRadius: 12 },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', borderBottom: `1px solid ${colors.grayLine}`, color: colors.text,
  },
  title: { fontWeight: 900, fontSize: 14 },
  small: { fontSize: 12, color: colors.textMuted },

  body: { minHeight: 140, display: 'grid', placeItems: 'center', padding: 10 },
  img: { maxWidth: '100%', maxHeight: 180, display: 'block', borderRadius: 10, border: `1px solid ${colors.grayLine}` },
  placeholder: { width: '100%', height: 140, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: `1px solid ${colors.grayLine}` },

  dots: { display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '8px 0' },
  dot: { width: 8, height: 8, borderRadius: 8, background: 'rgba(255,255,255,0.25)', cursor: 'pointer' },
  dotActive: { background: colors.accent, width: 18 },

  arrow: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
    background: 'rgba(255,255,255,0.06)', color: colors.text, border: `1px solid ${colors.grayLine}`,
    cursor: 'pointer', userSelect: 'none' as const,
  },
  arrowLeft: { left: 8 },
  arrowRight: { right: 8 },
}

// Local error boundary (prevents the whole page from blanking if slider crashes)
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

const NoticeCarousel: React.FC<{ autoIntervalMs?: number; limit?: number }> = ({ autoIntervalMs = 5000, limit = 10 }) => {
  const { data, isLoading } = useQuery<{ notices: Notice[] }>({
    queryKey: ['notices', limit],
    queryFn: async () => {
      const res = await getNotices({ limit, active: 1 })
      return res.data
    },
    refetchInterval: 60_000,
  })

  // SAFE MODE: render only image notices to avoid any chance of page breaking
  const all = useMemo(() => (data?.notices || []), [data])
  const notices = useMemo(
    () => all.filter(n => n && n.kind === 'image' && (n.image_url || '').trim().length > 0),
    [all]
  )
  const count = notices.length

  // no image notices → hide block completely
  if (!isLoading && count === 0) return null

  const [index, setIndex] = useState(0)
  useEffect(() => { if (index >= count && count > 0) setIndex(0) }, [count, index])

  const go = (i: number) => setIndex((i + count) % count)
  const next = () => go(index + 1)
  const prev = () => go(index - 1)

  // Pause on hover
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

  return (
    <SliderBoundary>
      <div style={styles.shell}>
        <Surface>
          <div
            style={styles.wrap}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div style={styles.header}>
              <div style={styles.title}>Announcements</div>
              {active?.created_at && (
                <div style={styles.small}>{new Date(active.created_at).toLocaleString()}</div>
              )}
            </div>

            <div style={styles.body}>
              {isLoading ? (
                <div style={styles.placeholder} />
              ) : active ? (
                active.image_url ? (
                  <a
                    href={active.link_url || '#'}
                    target={active.link_url ? '_blank' : undefined}
                    rel={active.link_url ? 'noopener noreferrer' : undefined}
                    style={{ display: 'inline-block' }}
                  >
                    <img src={active.image_url} alt={active.title || 'notice'} style={styles.img} />
                  </a>
                ) : (
                  <div style={{ color: colors.textMuted }}>Invalid image notice</div>
                )
              ) : null}
            </div>

            {count > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous"
                  style={{ ...styles.arrow, ...styles.arrowLeft }}
                  onClick={prev}
                >
                  <IconArrow dir="left" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  style={{ ...styles.arrow, ...styles.arrowRight }}
                  onClick={next}
                >
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
        </Surface>
      </div>
    </SliderBoundary>
  )
}

export default NoticeCarousel
