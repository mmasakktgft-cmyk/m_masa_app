export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const SLOT_LABEL: Record<Slot, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
}

export const SLOT_ICON: Record<Slot, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍪',
}

/** 1品分の栄養。P/F/C はグラム */
export interface FoodItem {
  name: string
  amount?: string
  kcal: number
  p?: number
  f?: number
  c?: number
}

export interface Meal {
  id: string
  slot: Slot
  items: FoodItem[]
  /** 写真（アプリの写真置き場の id） */
  photoId?: string
  memo?: string
  /** Claude で推定した値かどうか（目安であることを表示するため） */
  estimated?: boolean
  createdAt: number
}

export interface PlanEntry {
  id: string
  date: string
  slot: Slot
  title: string
  kcal?: number
  ingredients: string[]
  /** 記録に反映済みなら meal の id */
  loggedMealId?: string
}

/**
 * 1日分の記録。保存できる件数に上限があるため、食事・水分・体重・献立を1日1件にまとめる。
 * 保存先：data/users/<自分>/app/days/<YYYY-MM-DD>
 */
export interface Day {
  date: string
  meals: Meal[]
  waterMl?: number
  weight?: { kg: number; bodyFat?: number }
  plans: Omit<PlanEntry, 'date'>[]
}

export interface MyMenu {
  id: string
  name: string
  items: FoodItem[]
  useCount: number
  lastUsedAt: number
}

export interface ShoppingItem {
  id: string
  name: string
  done: boolean
  /** 献立から自動で作られた行は手入力行と区別して再生成できるようにする */
  fromPlan: boolean
  createdAt: number
}

/** Myメニューと買い物リスト。保存先：data/users/<自分>/lists */
export interface Lists {
  menus: MyMenu[]
  shopping: ShoppingItem[]
}

export type Sex = 'male' | 'female'
export type Goal = 'lose' | 'keep' | 'gain'

export interface Profile {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  /** 1.2〜1.9 */
  activity: number
  goal: Goal
  /** 手動で目標カロリーを決める場合（未設定なら自動算出） */
  kcalOverride?: number
  waterTargetMl: number
  /** 水分のワンタップ量 */
  cupMl: number
}

export const DEFAULT_PROFILE: Profile = {
  sex: 'female',
  age: 35,
  heightCm: 160,
  weightKg: 55,
  activity: 1.55,
  goal: 'keep',
  waterTargetMl: 2000,
  cupMl: 200,
}

export const emptyDay = (date: string): Day => ({ date, meals: [], plans: [] })

export const newId = (prefix: string): string =>
  prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
