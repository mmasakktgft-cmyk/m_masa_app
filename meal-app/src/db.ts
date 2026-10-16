import Dexie, { liveQuery, type Table } from 'dexie'
import { useEffect, useState } from 'react'
import type { FoodItem, Meal, MyMenu, PlanEntry, Profile, ShoppingItem, WaterEntry, WeightEntry } from './types'
import { DEFAULT_PROFILE } from './types'

class MealDB extends Dexie {
  meals!: Table<Meal, number>
  weights!: Table<WeightEntry, string>
  water!: Table<WaterEntry, string>
  myMenus!: Table<MyMenu, number>
  plans!: Table<PlanEntry, number>
  shopping!: Table<ShoppingItem, number>
  kv!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('meal-log')
    this.version(1).stores({
      meals: '++id, date, createdAt',
      weights: 'date',
      water: 'date',
      myMenus: '++id, name, lastUsedAt',
      plans: '++id, date',
      shopping: '++id, createdAt',
      kv: 'key',
    })
  }
}

export const db = new MealDB()

/** IndexedDB の変更を購読して再描画する（dexie-react-hooks の useLiveQuery 相当） */
export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

export async function loadProfile(): Promise<Profile | null> {
  const row = await db.kv.get('profile')
  return row ? { ...DEFAULT_PROFILE, ...(row.value as Partial<Profile>) } : null
}

export async function saveProfile(p: Profile): Promise<void> {
  await db.kv.put({ key: 'profile', value: p })
}

export async function addWater(date: string, deltaMl: number): Promise<void> {
  await db.transaction('rw', db.water, async () => {
    const cur = (await db.water.get(date))?.ml ?? 0
    await db.water.put({ date, ml: Math.max(cur + deltaMl, 0) })
  })
}

/** 最近食べた品目（同名は新しいものだけ） */
export async function recentItems(limit = 20): Promise<FoodItem[]> {
  const meals = await db.meals.orderBy('createdAt').reverse().limit(60).toArray()
  const seen = new Set<string>()
  const out: FoodItem[] = []
  for (const m of meals) {
    for (const it of m.items) {
      if (seen.has(it.name)) continue
      seen.add(it.name)
      out.push(it)
      if (out.length >= limit) return out
    }
  }
  return out
}

export async function touchMyMenu(id: number): Promise<void> {
  const m = await db.myMenus.get(id)
  if (m) await db.myMenus.update(id, { useCount: m.useCount + 1, lastUsedAt: Date.now() })
}

// ---- バックアップ ----

interface ExportData {
  app: 'meal-log'
  version: 1
  exportedAt: number
  meals: Omit<Meal, 'photo'>[]
  weights: WeightEntry[]
  water: WaterEntry[]
  myMenus: MyMenu[]
  plans: PlanEntry[]
  shopping: ShoppingItem[]
  profile: Profile | null
}

/** 写真はサイズが大きいためバックアップに含めない */
export async function exportAll(): Promise<ExportData> {
  const meals = (await db.meals.toArray()).map(({ photo: _photo, ...rest }) => rest)
  return {
    app: 'meal-log',
    version: 1,
    exportedAt: Date.now(),
    meals,
    weights: await db.weights.toArray(),
    water: await db.water.toArray(),
    myMenus: await db.myMenus.toArray(),
    plans: await db.plans.toArray(),
    shopping: await db.shopping.toArray(),
    profile: await loadProfile(),
  }
}

const TABLES = () => [db.meals, db.weights, db.water, db.myMenus, db.plans, db.shopping, db.kv]

/** バックアップで置き換える（現在のデータは消える） */
export async function importAll(data: ExportData): Promise<void> {
  if (data.app !== 'meal-log' || data.version !== 1) throw new Error('このアプリのバックアップファイルではありません')
  await db.transaction('rw', TABLES(), async () => {
    await Promise.all(TABLES().map((t) => t.clear()))
    await db.meals.bulkAdd(data.meals)
    await db.weights.bulkAdd(data.weights)
    await db.water.bulkAdd(data.water)
    await db.myMenus.bulkAdd(data.myMenus)
    await db.plans.bulkAdd(data.plans)
    await db.shopping.bulkAdd(data.shopping)
    if (data.profile) await saveProfile(data.profile)
  })
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', TABLES(), async () => {
    await Promise.all(TABLES().map((t) => t.clear()))
  })
}
