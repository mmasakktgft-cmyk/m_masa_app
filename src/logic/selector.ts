import type { Attempt, Field, Question, QuizConfig, TopicMastery } from '../types'
import { FIELD_TARGET_RATIO } from '../types'
import { DAY_MS, scoredAttempts } from './mastery'

/** 「直近3年」＝公開済みの最新3年度（R5〜R7）。これ以降の年度を重視する */
export const RECENT_FROM_YEAR = 2023

export const WEIGHTS = {
  recent: 3.0,
  older: 1.0,
  mastery: { review_due: 4.0, learning: 2.0, unseen: 1.5, mastered: 0.1 },
  weakModeBoost: 2.0,
  /** 分野バランス・難易度調整に使う直近の回答数 */
  recentWindow: 20,
  /** 同じ論点を続けて出さない範囲（直前◯問） */
  topicGap: 2,
  /** 誤答した論点は、翌日以降か◯問以上あとまで出さない */
  wrongCooldownQuestions: 5,
}

export interface SelectContext {
  questions: Question[]
  attempts: Attempt[]
  mastery: Map<string, TopicMastery>
  config: QuizConfig
  /** 不備報告で出題停止中の問題 */
  blockedIds: Set<string>
  now: number
  random?: () => number
}

export interface Selection {
  question: Question
  /** 全問を出し終えたため、過去に出した問題から再出題した */
  repeated: boolean
}

function inScope(q: Question, config: QuizConfig): boolean {
  if (config.mode === 'field' && config.fields.length > 0 && !config.fields.includes(q.field)) {
    return false
  }
  if (config.mode === 'exam' && config.examSetId && !q.id.startsWith(config.examSetId)) {
    return false
  }
  return true
}

export function yearWeight(q: Question): number {
  return q.examYear >= RECENT_FROM_YEAR ? WEIGHTS.recent : WEIGHTS.older
}

export function masteryWeight(
  q: Question,
  mastery: Map<string, TopicMastery>,
  weakMode: boolean,
): number {
  let w = 0
  for (const t of q.topicIds) {
    const state = mastery.get(t)?.state ?? 'unseen'
    let tw = WEIGHTS.mastery[state]
    if (weakMode && (state === 'review_due' || state === 'learning')) tw *= WEIGHTS.weakModeBoost
    w = Math.max(w, tw)
  }
  return w || WEIGHTS.mastery.unseen
}

export function balanceWeight(field: Field, recentFields: Field[]): number {
  if (recentFields.length === 0) return 1
  const share = recentFields.filter((f) => f === field).length / recentFields.length
  const target = FIELD_TARGET_RATIO[field]
  const ratio = target / Math.max(share, 0.05)
  return Math.min(2, Math.max(0.3, ratio))
}

export function difficultyWeight(difficulty: number, recentRate: number | null): number {
  if (recentRate === null) return 1
  const target = recentRate >= 0.8 ? 4 : recentRate >= 0.6 ? 3 : 2
  return 1 / (1 + 0.5 * Math.abs(difficulty - target))
}

function weightedPick<T>(items: { item: T; w: number }[], random: () => number): T {
  const total = items.reduce((s, x) => s + x.w, 0)
  let r = random() * total
  for (const x of items) {
    r -= x.w
    if (r <= 0) return x.item
  }
  return items[items.length - 1].item
}

/** 次に出す問題を選ぶ。候補がなければ null */
export function selectNext(ctx: SelectContext): Selection | null {
  const random = ctx.random ?? Math.random
  const qMap = new Map(ctx.questions.map((q) => [q.id, q]))
  const scored = scoredAttempts(ctx.attempts).sort((a, b) => a.answeredAt - b.answeredAt)
  const answeredIds = new Set(ctx.attempts.map((a) => a.questionId))

  const pool = ctx.questions.filter(
    (q) =>
      q.verification.status === 'verified' && !ctx.blockedIds.has(q.id) && inScope(q, ctx.config),
  )
  if (pool.length === 0) return null

  const fresh = pool.filter((q) => !answeredIds.has(q.id))
  if (fresh.length === 0) return pickRepeat(pool, scored)

  // 年度指定モードは問題番号順に通しで出す
  if (ctx.config.mode === 'exam') {
    const next = [...fresh].sort((a, b) => a.number - b.number)[0]
    return { question: next, repeated: false }
  }

  // 直前に出した論点・誤答直後の論点を避ける
  const recentTopics = new Set<string>()
  for (const a of scored.slice(-WEIGHTS.topicGap)) {
    qMap.get(a.questionId)?.topicIds.forEach((t) => recentTopics.add(t))
  }
  const cooling = new Set<string>()
  scored.forEach((a, i) => {
    const q = qMap.get(a.questionId)
    if (!q) return
    const after = scored.length - 1 - i
    const coolingNow =
      !a.isCorrect &&
      ctx.now - a.answeredAt < DAY_MS &&
      after < WEIGHTS.wrongCooldownQuestions
    for (const t of q.topicIds) {
      if (coolingNow) cooling.add(t)
      else if (a.isCorrect) cooling.delete(t)
    }
  })

  const avoid = (q: Question, set: Set<string>) => q.topicIds.some((t) => set.has(t))
  let candidates = fresh.filter((q) => !avoid(q, recentTopics) && !avoid(q, cooling))
  if (candidates.length === 0) candidates = fresh.filter((q) => !avoid(q, recentTopics))
  if (candidates.length === 0) candidates = fresh

  const recent = scored.slice(-WEIGHTS.recentWindow)
  const recentFields = recent
    .map((a) => qMap.get(a.questionId)?.field)
    .filter((f): f is Field => !!f)
  const recentRate = recent.length >= 5 ? recent.filter((a) => a.isCorrect).length / recent.length : null
  const weakMode = ctx.config.mode === 'weak'
  const useBalance = ctx.config.mode !== 'field'

  const weighted = candidates.map((q) => ({
    item: q,
    w:
      yearWeight(q) *
      masteryWeight(q, ctx.mastery, weakMode) *
      (useBalance ? balanceWeight(q.field, recentFields) : 1) *
      difficultyWeight(q.difficulty, recentRate),
  }))
  return { question: weightedPick(weighted, random), repeated: false }
}

/**
 * 範囲内の問題をすべて出し終えたときの再出題。
 * 誤答した問題を、最後に解いてから時間が経った順に出す（仕様 Q8）。
 */
function pickRepeat(pool: Question[], scored: Attempt[]): Selection | null {
  const last = new Map<string, Attempt>()
  for (const a of scored) last.set(a.questionId, a)
  const wrong = pool
    .filter((q) => {
      const a = last.get(q.id)
      return a && !a.isCorrect
    })
    .sort((a, b) => last.get(a.id)!.answeredAt - last.get(b.id)!.answeredAt)
  return wrong.length > 0 ? { question: wrong[0], repeated: true } : null
}

/** 学習カルテ用：現在の重み設定を文章にする */
export function describePolicy(mastery: Map<string, TopicMastery>, topicName: (id: string) => string): string[] {
  const due = [...mastery.values()].filter((m) => m.state === 'review_due')
  const lines = [
    `R5（${RECENT_FROM_YEAR}年度）以降の問題を、それ以前の約${WEIGHTS.recent}倍の確率で出題します。`,
    '本試験の分野配分（テクノロジ50・マネジメント10・ストラテジ20問）に近づくよう、出題が偏った分野は控えめにします。',
    '直近の正答率に合わせて、難易度を自動で調整します。',
    `間違えた論点は、翌日以降または${WEIGHTS.wrongCooldownQuestions}問以上あとに、別の問題で確認します。`,
  ]
  if (due.length > 0) {
    const names = due
      .slice(0, 5)
      .map((m) => topicName(m.topicId))
      .join('、')
    lines.unshift(`要復習の論点（${names}${due.length > 5 ? ' ほか' : ''}）を優先して出題します。`)
  }
  return lines
}
