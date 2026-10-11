import { useEffect, useState } from 'react'

export type Route = 'home' | 'setup' | 'quiz' | 'analysis' | 'karte' | 'topics' | 'settings'
const ROUTES: Route[] = ['home', 'setup', 'quiz', 'analysis', 'karte', 'topics', 'settings']

function parse(): Route {
  const r = location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(r) ? r : 'home'
}

export function navigate(r: Route): void {
  location.hash = r === 'home' ? '/' : `/${r}`
  window.scrollTo(0, 0)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
