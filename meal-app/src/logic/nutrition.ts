import type { FoodItem, Goal, Profile } from '../types'

export interface Totals {
  kcal: number
  p: number
  f: number
  c: number
}

export interface Targets extends Totals {
  bmr: number
  tdee: number
}

export const ACTIVITY_LEVELS: { value: number; label: string; hint: string }[] = [
  { value: 1.2, label: 'ほぼ座りっぱなし', hint: 'デスクワーク中心・運動なし' },
  { value: 1.375, label: 'やや低い', hint: '週1〜2回の軽い運動' },
  { value: 1.55, label: 'ふつう', hint: '立ち仕事や週3〜5回の運動' },
  { value: 1.725, label: '高い', hint: 'ほぼ毎日しっかり運動' },
  { value: 1.9, label: 'とても高い', hint: '肉体労働・アスリート' },
]

export const GOAL_LABEL: Record<Goal, string> = {
  lose: '減量',
  keep: '維持',
  gain: '増量',
}

/** 目標ごとの消費カロリーに対する増減（kcal/日） */
const GOAL_DELTA: Record<Goal, number> = { lose: -400, keep: 0, gain: 300 }

/** 基礎代謝（Mifflin-St Jeor 式） */
export function calcBmr(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age
  return Math.round(p.sex === 'male' ? base + 5 : base - 161)
}

/**
 * 1日の目標カロリーと PFC の目安。
 * たんぱく質は体重×係数、脂質はカロリーの25%、残りを炭水化物に充てる。
 */
export function calcTargets(profile: Profile): Targets {
  const bmr = calcBmr(profile)
  const tdee = Math.round(bmr * profile.activity)
  const auto = Math.max(Math.round((tdee + GOAL_DELTA[profile.goal]) / 10) * 10, 1200)
  const kcal = profile.kcalOverride && profile.kcalOverride > 0 ? profile.kcalOverride : auto
  const proteinPerKg = profile.goal === 'keep' ? 1.2 : 1.6
  const p = Math.round(profile.weightKg * proteinPerKg)
  const f = Math.round((kcal * 0.25) / 9)
  const c = Math.max(Math.round((kcal - p * 4 - f * 9) / 4), 0)
  return { bmr, tdee, kcal, p, f, c }
}

export function sumItems(items: FoodItem[]): Totals {
  const t = items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + (it.kcal || 0),
      p: acc.p + (it.p || 0),
      f: acc.f + (it.f || 0),
      c: acc.c + (it.c || 0),
    }),
    { kcal: 0, p: 0, f: 0, c: 0 },
  )
  return { kcal: Math.round(t.kcal), p: round1(t.p), f: round1(t.f), c: round1(t.c) }
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function bmi(heightCm: number, kg: number): number {
  const m = heightCm / 100
  return round1(kg / (m * m))
}
