import type { Attempt, Question, TopicMastery } from '../types'

export const DAY_MS = 24 * 60 * 60 * 1000

/** 正解のたびに伸ばす復習間隔（日） */
export const REVIEW_INTERVALS = [1, 3, 7, 21, 60]
/** 習得済みとみなす「異なる問題での連続正解」数 */
export const MASTERY_STREAK = 2
/** 習得済みとみなすのに必要な、正解どうしの最小間隔（日） */
export const MASTERY_MIN_GAP_DAYS = 3
/** 習得済みでもこの日数が経てば忘却チェックの対象に戻す */
export const FORGET_CHECK_DAYS = 60

function emptyMastery(topicId: string): TopicMastery {
  return {
    topicId,
    state: 'unseen',
    attempts: 0,
    correct: 0,
    wrong: 0,
    distinctCorrectStreak: 0,
    lastAnsweredAt: null,
    lastCorrectAt: null,
    nextReviewAt: null,
    intervalDays: 0,
    lapseCount: 0,
  }
}

/** 採点に含める回答（不備報告などで除外されたものを除く） */
export function scoredAttempts(attempts: Attempt[]): Attempt[] {
  return attempts.filter((a) => !a.excluded)
}

/**
 * 回答記録から論点ごとの習熟度を毎回計算し直す。
 * 派生データを保存しないので、採点除外をしても常に正しい状態になる。
 */
export function computeMastery(
  attempts: Attempt[],
  questions: Map<string, Question>,
  now: number,
): Map<string, TopicMastery> {
  const result = new Map<string, TopicMastery>()
  // 習得判定用：直近の連続正解に使われた問題ID・正解時刻
  const streakQuestions = new Map<string, Set<string>>()
  const streakTimes = new Map<string, number[]>()
  const lastWrong = new Map<string, boolean>()

  const sorted = scoredAttempts(attempts).sort((a, b) => a.answeredAt - b.answeredAt)
  for (const a of sorted) {
    const q = questions.get(a.questionId)
    if (!q) continue
    for (const topicId of q.topicIds) {
      const m = result.get(topicId) ?? emptyMastery(topicId)
      const qs = streakQuestions.get(topicId) ?? new Set<string>()
      const times = streakTimes.get(topicId) ?? []
      m.attempts++
      m.lastAnsweredAt = a.answeredAt
      if (a.isCorrect) {
        m.correct++
        m.lastCorrectAt = a.answeredAt
        // 勘での正解は「定着」の根拠にしない（間隔も伸ばさない）
        if (a.confidence !== 'guess') {
          if (!qs.has(a.questionId)) {
            qs.add(a.questionId)
            times.push(a.answeredAt)
          }
          const idx = REVIEW_INTERVALS.indexOf(m.intervalDays)
          m.intervalDays =
            m.intervalDays === 0
              ? REVIEW_INTERVALS[0]
              : REVIEW_INTERVALS[Math.min(idx + 1, REVIEW_INTERVALS.length - 1)]
        } else if (m.intervalDays === 0) {
          m.intervalDays = REVIEW_INTERVALS[0]
        }
      } else {
        m.wrong++
        m.lapseCount++
        m.intervalDays = REVIEW_INTERVALS[0]
        qs.clear()
        times.length = 0
      }
      lastWrong.set(topicId, !a.isCorrect)
      m.distinctCorrectStreak = qs.size
      m.nextReviewAt = a.answeredAt + m.intervalDays * DAY_MS
      result.set(topicId, m)
      streakQuestions.set(topicId, qs)
      streakTimes.set(topicId, times)
    }
  }

  for (const [topicId, m] of result) {
    const times = streakTimes.get(topicId) ?? []
    const gapOk =
      times.length >= MASTERY_STREAK &&
      times[times.length - 1] - times[0] >= MASTERY_MIN_GAP_DAYS * DAY_MS
    const forgotten =
      m.lastCorrectAt !== null && now - m.lastCorrectAt >= FORGET_CHECK_DAYS * DAY_MS
    const lastWasWrong = lastWrong.get(topicId) ?? false
    if (m.distinctCorrectStreak >= MASTERY_STREAK && gapOk) {
      // 習得済みでも長く空いたら、忘れていないかの確認として学習中に戻す
      m.state = forgotten ? 'learning' : 'mastered'
    } else if (lastWasWrong || (m.nextReviewAt !== null && now >= m.nextReviewAt)) {
      m.state = 'review_due'
    } else {
      m.state = 'learning'
    }
  }
  return result
}
