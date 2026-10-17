import { useSyncExternalStore } from 'react'

/**
 * 画面の切り替え。claude.ai 上のページでは URL に状態を載せられないため、アプリの中だけで持つ。
 */
export type RouteName = 'today' | 'meal' | 'plan' | 'body' | 'settings'

export type Params = Record<string, string | number | undefined>

export interface Route {
  name: RouteName
  params: Record<string, string>
}

const clean = (p: Params): Record<string, string> =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))

let stack: Route[] = [{ name: 'today', params: {} }]
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function navigate(name: RouteName, params: Params = {}, replace = false): void {
  const r = { name, params: clean(params) }
  stack = replace ? [...stack.slice(0, -1), r] : [...stack, r]
  emit()
  window.scrollTo(0, 0)
}

/** 前の画面へ。積んだ履歴がなければ fallback へ */
export function goBack(fallback: RouteName = 'today', params: Params = {}): void {
  if (stack.length > 1) stack = stack.slice(0, -1)
  else stack = [{ name: fallback, params: clean(params) }]
  emit()
  window.scrollTo(0, 0)
}

/** 下のタブからの移動：履歴を積まずに切り替える */
export function switchTab(name: RouteName, params: Params = {}): void {
  stack = [{ name, params: clean(params) }]
  emit()
  window.scrollTo(0, 0)
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => stack[stack.length - 1],
  )
}
