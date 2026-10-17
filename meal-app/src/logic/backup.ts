import type { Day, FoodItem, Lists, Profile, Slot } from '../types'
import { emptyDay } from '../types'

/** このアプリ（claude.ai 版）のバックアップ */
export interface BackupV2 {
  app: 'meal-log'
  version: 2
  exportedAt: number
  profile: Profile | null
  days: Day[]
  lists: Lists
}

/** GitHub 版（端末に保存する版）のバックアップ */
interface BackupV1 {
  app: 'meal-log'
  version: 1
  meals: { id?: number; date: string; slot: Slot; items: FoodItem[]; memo?: string; estimated?: boolean; createdAt: number }[]
  weights: { date: string; kg: number; bodyFat?: number }[]
  water: { date: string; ml: number }[]
  myMenus: { id?: number; name: string; items: FoodItem[]; useCount: number; lastUsedAt: number }[]
  plans: { id?: number; date: string; slot: Slot; title: string; kcal?: number; ingredients: string[] }[]
  shopping: { id?: number; name: string; done: boolean; fromPlan: boolean; createdAt: number }[]
  profile: Profile | null
}

export function makeBackup(profile: Profile | null, days: Record<string, Day>, lists: Lists): BackupV2 {
  return {
    app: 'meal-log',
    version: 2,
    exportedAt: Date.now(),
    profile,
    days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
    lists,
  }
}

/** バックアップを読み、取り込む形（日ごとの記録・リスト・プロフィール）にそろえる。形が違えば例外 */
export function readBackup(data: unknown): { profile: Profile | null; days: Day[]; lists: Lists } {
  const d = data as Partial<BackupV1 | BackupV2> | null
  if (!d || d.app !== 'meal-log') throw new Error('ごはん記録のバックアップファイルではありません')
  if (d.version === 2) {
    const b = d as BackupV2
    return {
      profile: b.profile ?? null,
      days: (b.days ?? []).filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map((x) => ({ ...emptyDay(x.date), ...x })),
      lists: { menus: b.lists?.menus ?? [], shopping: b.lists?.shopping ?? [] },
    }
  }
  if (d.version === 1) {
    const b = d as BackupV1
    const map = new Map<string, Day>()
    const day = (date: string) => {
      let x = map.get(date)
      if (!x) map.set(date, (x = emptyDay(date)))
      return x
    }
    for (const m of b.meals ?? [])
      day(m.date).meals.push({
        id: `v1m${m.id ?? m.createdAt}`,
        slot: m.slot,
        items: m.items ?? [],
        memo: m.memo,
        estimated: m.estimated,
        createdAt: m.createdAt,
      })
    for (const w of b.weights ?? []) day(w.date).weight = { kg: w.kg, ...(w.bodyFat ? { bodyFat: w.bodyFat } : {}) }
    for (const w of b.water ?? []) if (w.ml > 0) day(w.date).waterMl = w.ml
    for (const p of b.plans ?? [])
      day(p.date).plans.push({ id: `v1p${p.id ?? Math.random().toString(36).slice(2)}`, slot: p.slot, title: p.title, kcal: p.kcal, ingredients: p.ingredients ?? [] })
    return {
      profile: b.profile ?? null,
      days: [...map.values()].sort((a, b2) => a.date.localeCompare(b2.date)),
      lists: {
        menus: (b.myMenus ?? []).map((m, i) => ({ id: `v1mm${m.id ?? i}`, name: m.name, items: m.items, useCount: m.useCount ?? 0, lastUsedAt: m.lastUsedAt ?? 0 })),
        shopping: (b.shopping ?? []).map((s, i) => ({ id: `v1s${s.id ?? i}`, name: s.name, done: s.done, fromPlan: s.fromPlan, createdAt: s.createdAt })),
      },
    }
  }
  throw new Error('このバックアップの形式には対応していません')
}
