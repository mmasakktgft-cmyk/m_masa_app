/**
 * Claude 連携。claude.ai 上のアプリの機能（sample）で、利用者自身の Claude の利用枠を使って直接たずねる。
 * API キーや追加料金は不要。回答は JSON で受け取り、ここで形をそろえる。
 */
import type { Sample } from '../platform'
import type { FoodItem, Meal, PlanEntry, Profile, Slot } from '../types'
import { SLOT_LABEL, SLOTS } from '../types'
import { addDays, formatDay } from './date'
import { GOAL_LABEL, sumItems, type Targets, type Totals } from './nutrition'

const ITEMS_FORMAT = `{"items":[{"name":"ごはん","amount":"150g","kcal":234,"p":3.8,"f":0.5,"c":55.7}],"note":"仮定したことを1文で"}`

export function photoPrompt(slot: Slot, memo?: string): string {
  return [
    `添付したのは${SLOT_LABEL[slot]}の写真です。写っている料理を品目ごとに分けて、量・カロリー(kcal)・たんぱく質(p)・脂質(f)・炭水化物(c)をグラムで推定してください。`,
    memo ? `食べた人からの補足：${memo}` : '',
    '見えにくい部分は一般的な1人前で仮定し、仮定したことを note に短く書いてください。食べ物が写っていなければ items を空にして、note にその旨を書いてください。',
    `次の形の JSON だけを返してください（数値は半角数字のみ、品名と note は日本語）。`,
    ITEMS_FORMAT,
  ]
    .filter(Boolean)
    .join('\n')
}

export function textEstimatePrompt(description: string): string {
  return [
    `次の食事のカロリー(kcal)と PFC（たんぱく質p・脂質f・炭水化物c、グラム）を品目ごとに推定してください。量の指定がなければ一般的な1人前で仮定し、仮定したことを note に短く書いてください。`,
    `食事：${description}`,
    `次の形の JSON だけを返してください（数値は半角数字のみ、品名と note は日本語）。`,
    ITEMS_FORMAT,
  ].join('\n')
}

function fmtTotals(t: Totals): string {
  return `${t.kcal}kcal（P${Math.round(t.p)}g F${Math.round(t.f)}g C${Math.round(t.c)}g）`
}

function fmtItems(items: FoodItem[]): string {
  return items.map((i) => `${i.name}${i.amount ? ` ${i.amount}` : ''}`).join('、')
}

export interface AdviceInput {
  date: string
  meals: Meal[]
  targets: Targets
  profile: Profile
  waterMl: number
  /** 直近7日（当日を除く）の1日平均。記録がなければ null */
  weekAvg: Totals | null
  latestWeight?: number
}

export function advicePrompt(a: AdviceInput): string {
  const lines: string[] = []
  lines.push(`私の食事記録です。管理栄養士の視点で、良い点と改善点を日本語で簡潔にアドバイスしてください。`)
  lines.push(
    `【プロフィール】${a.profile.sex === 'male' ? '男性' : '女性'} ${a.profile.age}歳 ${a.profile.heightCm}cm ${a.latestWeight ?? a.profile.weightKg}kg／目標：${GOAL_LABEL[a.profile.goal]}`,
  )
  lines.push(`【1日の目標】${fmtTotals(a.targets)}`)
  lines.push(`【${formatDay(a.date)}の食事】`)
  for (const slot of SLOTS) {
    const ms = a.meals.filter((m) => m.slot === slot)
    if (ms.length === 0) continue
    const items = ms.flatMap((m) => m.items)
    lines.push(`・${SLOT_LABEL[slot]}：${fmtItems(items)} → ${fmtTotals(sumItems(items))}`)
  }
  if (a.meals.length === 0) lines.push('・まだ記録なし')
  lines.push(`【合計】${fmtTotals(sumItems(a.meals.flatMap((m) => m.items)))}／水分 ${a.waterMl}ml`)
  if (a.weekAvg) lines.push(`【直近7日の平均】${fmtTotals(a.weekAvg)}`)
  lines.push('次の食事で何を食べると良いかの具体例も1〜2個ください。見出しや記号は控えめにし、スマホで読みやすい短い段落と箇条書きで答えてください。')
  return lines.join('\n')
}

export interface PlanRequest {
  startDate: string
  days: number
  slots: Slot[]
  targets: Targets
  wishes?: string
}

export function planPrompt(r: PlanRequest): string {
  const dates = Array.from({ length: r.days }, (_, i) => addDays(r.startDate, i))
  return [
    `${formatDay(dates[0])}から${r.days}日分の献立を考えてください。`,
    `対象：${r.slots.map((s) => SLOT_LABEL[s]).join('・')}`,
    `1日の目標：${fmtTotals(r.targets)}`,
    r.wishes ? `希望：${r.wishes}` : '',
    '作り置きや食材の使い回しで、買い物と調理の手間が少なくなるようにしてください。',
    '次の形の JSON だけを返してください。slot は breakfast / lunch / dinner / snack、date は YYYY-MM-DD、ingredients は「食材 分量」の日本語の文字列です。',
    `{"plans":[{"date":"${dates[0]}","slot":"${r.slots[0]}","title":"鶏むね肉の照り焼き定食","kcal":620,"ingredients":["鶏むね肉 200g","米 1合"]}]}`,
  ]
    .filter(Boolean)
    .join('\n')
}

// ---- 回答の形をそろえる ----

/** "234kcal" や "3.8 g"、全角数字も数値として読む */
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v !== 'string') return undefined
  const half = v.replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  const m = half.match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : undefined
}

const SLOT_ALIASES: Record<string, Slot> = {
  breakfast: 'breakfast',
  朝食: 'breakfast',
  朝: 'breakfast',
  lunch: 'lunch',
  昼食: 'lunch',
  昼: 'lunch',
  dinner: 'dinner',
  夕食: 'dinner',
  夜: 'dinner',
  snack: 'snack',
  間食: 'snack',
}

export function toItem(raw: unknown): FoodItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  const kcal = num(r.kcal ?? r.calories ?? r.energy)
  if (!name || kcal === undefined) return null
  const item: FoodItem = { name, kcal: Math.round(kcal) }
  if (typeof r.amount === 'string' && r.amount.trim()) item.amount = r.amount.trim()
  else if (typeof r.amount === 'number') item.amount = String(r.amount)
  const p = num(r.p ?? r.protein)
  const f = num(r.f ?? r.fat)
  const c = num(r.c ?? r.carbs ?? r.carbohydrate)
  if (p !== undefined) item.p = p
  if (f !== undefined) item.f = f
  if (c !== undefined) item.c = c
  return item
}

export function toPlan(raw: unknown): Omit<PlanEntry, 'id'> | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null
  const slot = typeof r.slot === 'string' ? (SLOT_ALIASES[r.slot.trim().toLowerCase()] ?? SLOT_ALIASES[r.slot.trim()]) : undefined
  const title = typeof r.title === 'string' ? r.title.trim() : typeof r.name === 'string' ? r.name.trim() : ''
  if (!date || !slot || !title) return null
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : []
  const kcal = num(r.kcal)
  return { date, slot, title, ingredients, ...(kcal !== undefined ? { kcal: Math.round(kcal) } : {}) }
}

export interface Estimate {
  items: FoodItem[]
  note?: string
}

/** Claude の JSON 回答から品目を取り出す（配列だけ返ってきた場合も受け付ける） */
export function readEstimate(data: unknown): Estimate {
  const d = (Array.isArray(data) ? { items: data } : data) as Record<string, unknown> | null
  const items = Array.isArray(d?.items) ? d.items.map(toItem).filter((x): x is FoodItem => x !== null) : []
  const note = typeof d?.note === 'string' && d.note.trim() ? d.note.trim() : undefined
  return { items, note }
}

export function readPlans(data: unknown): Omit<PlanEntry, 'id'>[] {
  const d = (Array.isArray(data) ? { plans: data } : data) as Record<string, unknown> | null
  return Array.isArray(d?.plans) ? d.plans.map(toPlan).filter((x): x is Omit<PlanEntry, 'id'> => x !== null) : []
}

// ---- たずねる ----

export async function estimateFromPhoto(sample: Sample, photo: Blob, slot: Slot, memo?: string, signal?: AbortSignal): Promise<Estimate> {
  return readEstimate(await sample.json(photoPrompt(slot, memo), { images: photo, signal }))
}

export async function estimateFromText(sample: Sample, description: string, signal?: AbortSignal): Promise<Estimate> {
  return readEstimate(await sample.json(textEstimatePrompt(description), { signal }))
}

export async function suggestPlans(sample: Sample, r: PlanRequest, signal?: AbortSignal) {
  return readPlans(await sample.json(planPrompt(r), { signal, cache: false }))
}
