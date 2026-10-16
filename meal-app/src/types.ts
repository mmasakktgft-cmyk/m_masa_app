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
  id?: number
  /** YYYY-MM-DD（端末のローカル日付） */
  date: string
  slot: Slot
  items: FoodItem[]
  photo?: Blob
  memo?: string
  /** 写真から Claude で推定した値かどうか（目安であることを表示するため） */
  estimated?: boolean
  createdAt: number
}

export interface WeightEntry {
  date: string
  kg: number
  bodyFat?: number
}

export interface WaterEntry {
  date: string
  ml: number
}

export interface MyMenu {
  id?: number
  name: string
  items: FoodItem[]
  useCount: number
  lastUsedAt: number
}

export interface PlanEntry {
  id?: number
  date: string
  slot: Slot
  title: string
  kcal?: number
  ingredients: string[]
  /** 記録に反映済みなら meal の id */
  loggedMealId?: number
}

export interface ShoppingItem {
  id?: number
  name: string
  done: boolean
  /** 献立から自動で作られた行は手入力行と区別して再生成できるようにする */
  fromPlan: boolean
  createdAt: number
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
