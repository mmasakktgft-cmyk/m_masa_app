/**
 * Claude 連携（API は使わない）。
 * プロンプトを組み立てて claude.ai / Claude アプリへ渡し、返ってきた回答の JSON を貼り付けで取り込む。
 * 利用者の Claude アカウント（無料プランでも可）で動くので、このアプリ側の費用は 0 円。
 */
import type { FoodItem, Meal, PlanEntry, Profile, Slot } from '../types'
import { SLOT_LABEL, SLOTS } from '../types'
import { addDays, formatDay } from './date'
import { GOAL_LABEL, sumItems, type Targets, type Totals } from './nutrition'

export const CLAUDE_NEW_URL = 'https://claude.ai/new'

/** これを超える長さは URL に載せず、クリップボード経由だけで渡す */
const MAX_QUERY_LENGTH = 1800

export function claudeUrl(prompt: string): string {
  const q = encodeURIComponent(prompt)
  return q.length <= MAX_QUERY_LENGTH ? `${CLAUDE_NEW_URL}?q=${q}` : CLAUDE_NEW_URL
}

const ITEMS_FORMAT = `\`\`\`json
{"items":[{"name":"ごはん","amount":"150g","kcal":234,"p":3.8,"f":0.5,"c":55.7}]}
\`\`\``

export function photoPrompt(slot: Slot, memo?: string): string {
  return [
    `添付した${SLOT_LABEL[slot]}の写真から、写っている料理を品目ごとに分けて、量・カロリー・たんぱく質(p)・脂質(f)・炭水化物(c)をグラムで推定してください。`,
    memo ? `補足：${memo}` : '',
    '見えにくい部分は一般的な1人前で仮定し、仮定した点を短く書いてください。',
    `回答の最後に、食事記録アプリに貼り付けるための JSON を次の形式のコードブロックで必ず付けてください（数値は半角数字のみ）。`,
    ITEMS_FORMAT,
  ]
    .filter(Boolean)
    .join('\n')
}

export function textEstimatePrompt(description: string): string {
  return [
    `次の食事のカロリーと PFC（たんぱく質p・脂質f・炭水化物c、グラム）を品目ごとに推定してください。`,
    `食事：${description}`,
    `回答の最後に、次の形式の JSON をコードブロックで必ず付けてください（数値は半角数字のみ）。`,
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
  lines.push(`私の食事記録です。管理栄養士の視点で、良い点と改善点を簡潔にアドバイスしてください。`)
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
  lines.push('次の食事で何を食べると良いかの具体例も1〜2個ください。')
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
    '回答の最後に、食事記録アプリに貼り付けるための JSON を次の形式のコードブロックで必ず付けてください。',
    'slot は breakfast / lunch / dinner / snack、date は YYYY-MM-DD、ingredients は「食材 分量」の文字列です。',
    '```json',
    `{"plans":[{"date":"${dates[0]}","slot":"${r.slots[0]}","title":"鶏むね肉の照り焼き定食","kcal":620,"ingredients":["鶏むね肉 200g","米 1合"]}]}`,
    '```',
  ]
    .filter(Boolean)
    .join('\n')
}

// ---- 回答の取り込み ----

export type ParsedReply =
  | { kind: 'items'; items: FoodItem[] }
  | { kind: 'plans'; plans: Omit<PlanEntry, 'id'>[] }

/** "234kcal" や "3.8 g"、全角数字も数値として読む */
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v !== 'string') return undefined
  const half = v.replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  const m = half.match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : undefined
}

function candidates(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) out.push(m[1])
  // コードブロックが崩れて貼られた場合に備えて、最初の { から最後の } までも試す
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) out.push(text.slice(first, last + 1))
  const firstA = text.indexOf('[')
  const lastA = text.lastIndexOf(']')
  if (firstA >= 0 && lastA > firstA) out.push(text.slice(firstA, lastA + 1))
  return out
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

function toItem(raw: unknown): FoodItem | null {
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

function toPlan(raw: unknown): Omit<PlanEntry, 'id'> | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null
  const slot = typeof r.slot === 'string' ? SLOT_ALIASES[r.slot.trim().toLowerCase()] ?? SLOT_ALIASES[r.slot.trim()] : undefined
  const title = typeof r.title === 'string' ? r.title.trim() : typeof r.name === 'string' ? r.name.trim() : ''
  if (!date || !slot || !title) return null
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : []
  const kcal = num(r.kcal)
  return { date, slot, title, ingredients, ...(kcal !== undefined ? { kcal: Math.round(kcal) } : {}) }
}

/** Claude の回答テキストから取り込める JSON を探す。見つからなければ null */
export function parseReply(text: string): ParsedReply | null {
  for (const c of candidates(text)) {
    let data: unknown
    try {
      data = JSON.parse(c.trim())
    } catch {
      continue
    }
    if (Array.isArray(data)) data = { items: data }
    if (!data || typeof data !== 'object') continue
    const d = data as Record<string, unknown>
    if (Array.isArray(d.plans)) {
      const plans = d.plans.map(toPlan).filter((x): x is Omit<PlanEntry, 'id'> => x !== null)
      if (plans.length) return { kind: 'plans', plans }
    }
    if (Array.isArray(d.items)) {
      const items = d.items.map(toItem).filter((x): x is FoodItem => x !== null)
      if (items.length) return { kind: 'items', items }
    }
  }
  return null
}

// ---- 送る ----

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 古いブラウザや権限がない場合の代替
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** プロンプトをコピーしてから claude.ai を新しいタブで開く */
export async function openClaude(prompt: string): Promise<void> {
  // window.open はユーザー操作の直後でないとブロックされるので先に開く
  // （'noopener' を付けると戻り値が常に null になり、開けたか判定できないため付けない）
  const win = window.open(claudeUrl(prompt), '_blank')
  if (win) win.opener = null
  await copyText(prompt)
  if (!win) location.href = claudeUrl(prompt)
}

export function canSharePhoto(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    const probe = new File([new Uint8Array(1)], 'probe.jpg', { type: 'image/jpeg' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * 写真とプロンプトを共有シートで渡す（スマホでは Claude アプリを選べる）。
 * 共有先によっては本文が落ちるので、プロンプトは先にコピーしておく。
 * 'shared' | 'cancelled' | 'unsupported'
 */
export async function sharePhotoToClaude(photo: Blob, prompt: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  await copyText(prompt)
  const file = new File([photo], `meal-${Date.now()}.jpg`, { type: photo.type || 'image/jpeg' })
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported'
  try {
    await navigator.share({ files: [file], text: prompt })
    return 'shared'
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    return 'unsupported'
  }
}

export async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}
