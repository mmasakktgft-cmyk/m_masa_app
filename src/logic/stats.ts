import type { Attempt, Field, KarteSummary, Question, TopicMastery } from '../types'
import { FIELD_NAMES } from '../types'
import { DAY_MS, scoredAttempts } from './mastery'

export interface RateStat {
  correct: number
  n: number
  rate: number | null
}

/** この件数未満の集計は「参考値」として扱う */
export const MIN_RELIABLE_N = 10

export function rate(attempts: Attempt[]): RateStat {
  const n = attempts.length
  const correct = attempts.filter((a) => a.isCorrect).length
  return { correct, n, rate: n === 0 ? null : correct / n }
}

export function chronological(attempts: Attempt[]): Attempt[] {
  return scoredAttempts(attempts).sort((a, b) => a.answeredAt - b.answeredAt)
}

export function lastN(attempts: Attempt[], n: number): Attempt[] {
  return chronological(attempts).slice(-n)
}

export function fieldStats(
  attempts: Attempt[],
  questions: Map<string, Question>,
): Record<Field, RateStat> {
  const out = {} as Record<Field, RateStat>
  for (const f of Object.keys(FIELD_NAMES) as Field[]) {
    out[f] = rate(attempts.filter((a) => questions.get(a.questionId)?.field === f))
  }
  return out
}

/** 10問ごとの正答率の推移 */
export function trend(attempts: Attempt[], bucket = 10): number[] {
  const list = chronological(attempts)
  const out: number[] = []
  for (let i = 0; i + bucket <= list.length; i += bucket) {
    const chunk = list.slice(i, i + bucket)
    out.push(chunk.filter((a) => a.isCorrect).length / bucket)
  }
  return out
}

export interface TopicSummary {
  topicId: string
  wrong: number
  attempts: number
}

/** 2回以上間違えている論点（誤答数の多い順） */
export function repeatedMistakes(mastery: Map<string, TopicMastery>): TopicSummary[] {
  return [...mastery.values()]
    .filter((m) => m.wrong >= 2)
    .sort((a, b) => b.wrong - a.wrong || b.attempts - a.attempts)
    .map((m) => ({ topicId: m.topicId, wrong: m.wrong, attempts: m.attempts }))
}

/** 過去に間違えたが、その後に別の問題で正解できている論点 */
export function improvedTopics(mastery: Map<string, TopicMastery>): string[] {
  return [...mastery.values()]
    .filter((m) => m.wrong > 0 && m.distinctCorrectStreak >= 1 && m.state !== 'mastered')
    .map((m) => m.topicId)
}

export function topicsByState(
  mastery: Map<string, TopicMastery>,
  state: TopicMastery['state'],
): string[] {
  return [...mastery.values()].filter((m) => m.state === state).map((m) => m.topicId)
}

/**
 * 学習の優先順位：正答率の低い分野と、要復習の論点が多い分野を上にする。
 * 未出題の分野は「まず実力把握」として扱う。
 */
export function priorities(
  attempts: Attempt[],
  questions: Map<string, Question>,
  mastery: Map<string, TopicMastery>,
  topicField: (topicId: string) => Field | undefined,
): { field: Field; reason: string }[] {
  const fs = fieldStats(scoredAttempts(attempts), questions)
  const dueCount = (f: Field) =>
    [...mastery.values()].filter((m) => m.state === 'review_due' && topicField(m.topicId) === f)
      .length
  return (Object.keys(fs) as Field[])
    .map((f) => {
      const s = fs[f]
      const due = dueCount(f)
      if (s.n === 0) return { field: f, score: 0.5, reason: '未出題。まず実力を把握' }
      const score = (1 - (s.rate ?? 0)) + due * 0.05
      const parts = [`正答率 ${pct(s.rate)}`]
      if (due > 0) parts.push(`要復習 ${due} 論点`)
      if (s.n < MIN_RELIABLE_N) parts.push('参考値')
      return { field: f, score, reason: parts.join('・') }
    })
    .sort((a, b) => b.score - a.score)
    .map(({ field, reason }) => ({ field, reason }))
}

export function pct(r: number | null): string {
  return r === null ? '—' : `${Math.round(r * 100)}%`
}

/** 指定日（ローカル時刻）の回答数 */
export function countOnDay(attempts: Attempt[], day: Date): number {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  return attempts.filter((a) => a.answeredAt >= start && a.answeredAt < start + DAY_MS).length
}

/** 今日（または昨日）まで何日連続で演習しているか */
export function studyStreak(attempts: Attempt[], now: Date): number {
  const days = new Set(
    attempts.map((a) => {
      const d = new Date(a.answeredAt)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    }),
  )
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!days.has(key(cur))) cur.setDate(cur.getDate() - 1)
  let streak = 0
  while (days.has(key(cur))) {
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}

/** 学習カルテの作成単位 */
export const KARTE_EVERY = 50

export function buildKarte(
  attempts: Attempt[],
  questions: Map<string, Question>,
  mastery: Map<string, TopicMastery>,
  policy: string[],
): KarteSummary {
  const scored = scoredAttempts(attempts)
  const overall = rate(scored)
  const fs = fieldStats(scored, questions)
  const fieldRates = {} as KarteSummary['fieldRates']
  for (const f of Object.keys(fs) as Field[]) fieldRates[f] = { rate: fs[f].rate, n: fs[f].n }
  return {
    overallRate: overall.rate,
    overallN: overall.n,
    fieldRates,
    weakTopics: repeatedMistakes(mastery).map((t) => t.topicId),
    masteredTopics: topicsByState(mastery, 'mastered'),
    reviewTopics: topicsByState(mastery, 'review_due'),
    policy,
  }
}
