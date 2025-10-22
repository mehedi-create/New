import { useEffect, useState } from 'react'

export default function useMedia(query: string) {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const m = window.matchMedia(query)
    const onChange = () => setMatch(!!m.matches)
    onChange()
    m.addEventListener ? m.addEventListener('change', onChange) : m.addListener(onChange)
    return () => {
      m.removeEventListener ? m.removeEventListener('change', onChange) : m.removeListener(onChange)
    }
  }, [query])
  return match
}
