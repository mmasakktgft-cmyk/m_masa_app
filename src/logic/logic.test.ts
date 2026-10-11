import { describe, expect, it } from 'vitest'
import type { Attempt, Question, QuizConfig } from '../types'
import { computeMastery, DAY_MS } from './mastery'
import { balanceWeight, selectNext, yearWeight } from './selector'
import { buildClaudePrompt } from './claudePrompt'
import { lastN, rate, studyStreak, trend } from './stats'

function q(id: string, topic: string, opts: Partial<Question> = {}): Question {
  return {
    id,
    kind: 'past',
    examYear: 2024,
    season: 'spring',
    section: 'A',
    number: Number(id.split('-').pop()),
    stem: `問題 ${id}`,
    choices: [
      { label: 'ア', text: 'a' },
      { label: 'イ', text: 'b' },
      { label: 'ウ', text: 'c' },
      { label: 'エ', text: 'd' },
    ],
    answer: 'ア',
    field: 'technology',
    categoryLarge: 'x',
    categoryMiddle: 'y',
    topicIds: [topic],
    questionType: 'knowledge',
    difficulty: 3,
    explanation: {
      basis: '根拠',
      perChoice: { ア: '', イ: '', ウ: '', エ: '' },
      pitfalls: '',
    },
    source: { label: 'R6春 午前' },
    verification: { status: 'verified', checks: [] },
    ...opts,
  }
}

const T0 = Date.UTC(2026, 9, 1)
let seq = 0
function att(questionId: string, correct: boolean, at: number, extra: Partial<Attempt> = {}): Attempt {
  return {
    id: ++seq,
    questionId,
    answeredAt: at,
    choice: correct ? 'ア' : 'イ',
    gaveUp: false,
    isCorrect: correct,
    confidence: null,
    timeSpentSec: 30,
    excluded: false,
    ...extra,
  }
}

const AUTO: QuizConfig = { mode: 'auto', fields: [], count: 10 }

describe('習熟度', () => {
  const qs = [q('AP-R06H-AM-01', 't1'), q('AP-R06H-AM-02', 't1'), q('AP-R06H-AM-03', 't1')]
  const map = new Map(qs.map((x) => [x.id, x]))

  it('回答がなければ論点は出てこない（未学習）', () => {
    expect(computeMastery([], map, T0).size).toBe(0)
  })

  it('直近が誤答なら要復習', () => {
    const m = computeMastery([att(qs[0].id, false, T0)], map, T0 + 1000)
    expect(m.get('t1')?.state).toBe('review_due')
  })

  it('異なる2問で3日以上空けて連続正解すると習得済み', () => {
    const m = computeMastery(
      [att(qs[0].id, true, T0), att(qs[1].id, true, T0 + 3 * DAY_MS)],
      map,
      T0 + 3 * DAY_MS + 1000,
    )
    expect(m.get('t1')?.state).toBe('mastered')
  })

  it('同じ日に2問正解しただけでは習得済みにしない', () => {
    const m = computeMastery([att(qs[0].id, true, T0), att(qs[1].id, true, T0 + 1000)], map, T0 + 2000)
    expect(m.get('t1')?.state).toBe('learning')
  })

  it('同じ問題を2回正解しても習得済みにしない', () => {
    const m = computeMastery(
      [att(qs[0].id, true, T0), att(qs[0].id, true, T0 + 5 * DAY_MS)],
      map,
      T0 + 5 * DAY_MS,
    )
    expect(m.get('t1')?.distinctCorrectStreak).toBe(1)
    expect(m.get('t1')?.state).not.toBe('mastered')
  })

  it('「勘」の正解は習得の根拠に数えない', () => {
    const m = computeMastery(
      [att(qs[0].id, true, T0), att(qs[1].id, true, T0 + 4 * DAY_MS, { confidence: 'guess' })],
      map,
      T0 + 4 * DAY_MS,
    )
    expect(m.get('t1')?.distinctCorrectStreak).toBe(1)
    expect(m.get('t1')?.state).not.toBe('mastered')
  })

  it('誤答で連続正解がリセットされ、復習間隔は1日に戻る', () => {
    const m = computeMastery(
      [att(qs[0].id, true, T0), att(qs[1].id, true, T0 + DAY_MS), att(qs[2].id, false, T0 + 2 * DAY_MS)],
      map,
      T0 + 2 * DAY_MS,
    )
    const t = m.get('t1')!
    expect(t.distinctCorrectStreak).toBe(0)
    expect(t.intervalDays).toBe(1)
    expect(t.lapseCount).toBe(1)
  })

  it('採点除外した回答は計算に含めない', () => {
    const m = computeMastery([att(qs[0].id, false, T0, { excluded: true })], map, T0)
    expect(m.size).toBe(0)
  })

  it('復習期限を過ぎると要復習になる', () => {
    const m = computeMastery([att(qs[0].id, true, T0)], map, T0 + 2 * DAY_MS)
    expect(m.get('t1')?.state).toBe('review_due')
  })
})

describe('出題の選択', () => {
  const base = { mastery: new Map(), blockedIds: new Set<string>(), now: T0, config: AUTO }

  it('出題済みの問題は出さない', () => {
    const qs = [q('S-1-01', 'a'), q('S-1-02', 'b')]
    const sel = selectNext({ ...base, questions: qs, attempts: [att('S-1-01', true, T0 - 1000)] })
    expect(sel?.question.id).toBe('S-1-02')
  })

  it('未検証・出題停止の問題は出さない', () => {
    const qs = [
      q('S-1-01', 'a', { verification: { status: 'disputed', checks: [] } }),
      q('S-1-02', 'b'),
      q('S-1-03', 'c'),
    ]
    for (let i = 0; i < 20; i++) {
      const sel = selectNext({ ...base, questions: qs, attempts: [], blockedIds: new Set(['S-1-02']) })
      expect(sel?.question.id).toBe('S-1-03')
    }
  })

  it('直前と同じ論点は避ける', () => {
    const qs = [q('S-1-01', 'a'), q('S-1-02', 'a'), q('S-1-03', 'b')]
    for (let i = 0; i < 20; i++) {
      const sel = selectNext({ ...base, questions: qs, attempts: [att('S-1-01', true, T0 - 1000)] })
      expect(sel?.question.id).toBe('S-1-03')
    }
  })

  it('誤答した論点は、5問以上あとか翌日以降まで出さない', () => {
    const qs = [
      q('S-1-01', 'a'), q('S-1-02', 'a'),
      q('S-1-03', 'b'), q('S-1-04', 'c'), q('S-1-05', 'd'), q('S-1-06', 'e'),
    ]
    const attempts = [att('S-1-01', false, T0 - 5000), att('S-1-03', true, T0 - 4000), att('S-1-04', true, T0 - 3000)]
    for (let i = 0; i < 20; i++) {
      const sel = selectNext({ ...base, questions: qs, attempts })
      expect(sel?.question.topicIds).not.toContain('a')
    }
    // 翌日になれば出してよい（他の候補を消して確認）
    const next = selectNext({ ...base, questions: qs.slice(0, 2), attempts: attempts.slice(0, 1), now: T0 + DAY_MS })
    expect(next?.question.id).toBe('S-1-02')
  })

  it('全問出し終えたら、誤答した問題を古い順に再出題する', () => {
    const qs = [q('S-1-01', 'a'), q('S-1-02', 'b'), q('S-1-03', 'c')]
    const attempts = [
      att('S-1-01', true, T0 - 3000),
      att('S-1-02', false, T0 - 2000),
      att('S-1-03', false, T0 - 1000),
    ]
    const sel = selectNext({ ...base, questions: qs, attempts })
    expect(sel).toEqual({ question: qs[1], repeated: true })
  })

  it('全問正解済みなら null', () => {
    const qs = [q('S-1-01', 'a')]
    expect(selectNext({ ...base, questions: qs, attempts: [att('S-1-01', true, T0)] })).toBeNull()
  })

  it('分野指定モードは指定外の分野を出さない', () => {
    const qs = [q('S-1-01', 'a'), q('S-1-02', 'b', { field: 'strategy' })]
    for (let i = 0; i < 20; i++) {
      const sel = selectNext({ ...base, questions: qs, attempts: [], config: { mode: 'field', fields: ['strategy'], count: 5 } })
      expect(sel?.question.id).toBe('S-1-02')
    }
  })

  it('年度指定モードは問題番号順', () => {
    const qs = [q('S-1-03', 'c'), q('S-1-01', 'a'), q('S-1-02', 'b'), q('X-9-01', 'z')]
    const config: QuizConfig = { mode: 'exam', fields: [], examSetId: 'S-1', count: 0 }
    expect(selectNext({ ...base, questions: qs, attempts: [], config })?.question.id).toBe('S-1-01')
    expect(
      selectNext({ ...base, questions: qs, attempts: [att('S-1-01', true, T0)], config })?.question.id,
    ).toBe('S-1-02')
  })

  it('直近3年度（R5以降）の問題が約3倍選ばれやすい', () => {
    expect(yearWeight(q('A-1-01', 'a', { examYear: 2023 }))).toBe(3)
    expect(yearWeight(q('A-1-02', 'a', { examYear: 2022 }))).toBe(1)
    const qs = [q('S-1-01', 'a', { examYear: 2025 }), q('S-1-02', 'b', { examYear: 2015 })]
    let recent = 0
    // 再現性のある疑似乱数（mulberry32）
    let seed = 42
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let i = 0; i < 4000; i++) {
      if (selectNext({ ...base, questions: qs, attempts: [], random })?.question.examYear === 2025) recent++
    }
    expect(recent / 4000).toBeGreaterThan(0.7)
    expect(recent / 4000).toBeLessThan(0.8)
  })

  it('偏って出た分野は控えめにする', () => {
    expect(balanceWeight('technology', Array(10).fill('technology'))).toBeLessThan(1)
    expect(balanceWeight('strategy', Array(10).fill('technology'))).toBeGreaterThan(1)
  })
})

describe('集計', () => {
  it('正答率と直近N問', () => {
    const list = [att('a', true, 3), att('b', false, 1), att('c', true, 2), att('d', true, 4, { excluded: true })]
    expect(rate(lastN(list, 2))).toEqual({ correct: 2, n: 2, rate: 1 })
    expect(lastN(list, 10).map((a) => a.questionId)).toEqual(['b', 'c', 'a'])
    expect(rate([]).rate).toBeNull()
  })

  it('10問ごとの推移', () => {
    const list = Array.from({ length: 25 }, (_, i) => att(`q${i}`, i < 10, i))
    expect(trend(list)).toEqual([1, 0])
  })

  it('連続学習日数', () => {
    const now = new Date(2026, 9, 10, 12)
    const day = (d: number) => new Date(2026, 9, d, 9).getTime()
    expect(studyStreak([att('a', true, day(10)), att('b', true, day(9)), att('c', true, day(7))], now)).toBe(2)
    // 今日まだ解いていなくても、昨日まで続いていれば途切れていない
    expect(studyStreak([att('a', true, day(9)), att('b', true, day(8))], now)).toBe(2)
    expect(studyStreak([], now)).toBe(0)
  })
})

describe('Claude への質問文', () => {
  it('問題・正解・自分の回答・質問を含む', () => {
    const text = buildClaudePrompt(q('S-1-01', 'a'), att('S-1-01', false, T0), 'なぜイは誤り？')
    expect(text).toContain('問題 S-1-01')
    expect(text).toContain('【正解】ア　【私の回答】イ')
    expect(text).toContain('なぜイは誤り？')
  })
})
