import { useEffect, useState } from 'react'

export type RouteName = 'today' | 'meal' | 'plan' | 'body' | 'settings'
const ROUTES: RouteName[] = ['today', 'meal', 'plan', 'body', 'settings']

export interface Route {
  name: RouteName
  params: Record<string, string>
}

function parse(): Route {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const name = (ROUTES.includes(path as RouteName) ? path : 'today') as RouteName
  return { name, params: Object.fromEntries(new URLSearchParams(query)) }
}

export function href(name: RouteName, params: Record<string, string | number | undefined> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const qs = q.toString()
  return `#/${name === 'today' ? '' : name}${qs ? `?${qs}` : ''}`
}

/** アプリ内で積んだ履歴の数。直接開いた画面で「戻る」を押してもアプリ外へ出ないようにする */
let depth = 0

export function navigate(name: RouteName, params: Record<string, string | number | undefined> = {}, replace = false): void {
  const h = href(name, params)
  if (replace) {
    history.replaceState(null, '', h)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    depth++
    location.hash = h
  }
  window.scrollTo(0, 0)
}

export function goBack(fallback: RouteName = 'today', params: Record<string, string | number | undefined> = {}): void {
  if (depth > 0) {
    depth--
    history.back()
  } else navigate(fallback, params, true)
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
