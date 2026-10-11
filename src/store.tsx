import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, loadSettings, saveSettings } from './db'
import { loadBank, sampleSetIds, setIdOf, type QuestionBank } from './data'
import { computeMastery, scoredAttempts } from './logic/mastery'
import { buildKarte, KARTE_EVERY } from './logic/stats'
import { describePolicy } from './logic/selector'
import type { Attempt, Karte, Question, Report, ReportReason, Settings, Topic, TopicMastery } from './types'

interface Store {
  bank: QuestionBank
  /** 設定（サンプルを含めるか）を反映した出題対象の問題 */
  questions: Question[]
  questionMap: Map<string, Question>
  topics: Map<string, Topic>
  settings: Settings
  attempts: Attempt[]
  reports: Report[]
  kartes: Karte[]
  mastery: Map<string, TopicMastery>
  blockedIds: Set<string>
  topicName: (id: string) => string
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  recordAttempt: (a: Omit<Attempt, 'id'>) => Promise<Karte | null>
  reportQuestion: (questionId: string, reason: ReportReason, comment: string) => Promise<void>
  withdrawReport: (reportId: number) => Promise<void>
  reload: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider がありません')
  return s
}

const REPORTED = 'reported'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bank, setBank] = useState<QuestionBank | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [kartes, setKartes] = useState<Karte[]>([])
  const [now, setNow] = useState(() => Date.now())

  const reload = useCallback(async () => {
    const [s, a, r, k] = await Promise.all([
      loadSettings(),
      db.attempts.toArray(),
      db.reports.toArray(),
      db.kartes.orderBy('createdAt').toArray(),
    ])
    setSettings(s)
    setAttempts(a)
    setReports(r)
    setKartes(k)
    setNow(Date.now())
  }, [])

  useEffect(() => {
    loadBank().then(setBank).catch((e) => setError(String(e)))
    reload()
  }, [reload])

  const value = useMemo<Store | null>(() => {
    if (!bank || !settings) return null
    const samples = sampleSetIds(bank)
    const questions = settings.includeSamples
      ? bank.questions
      : bank.questions.filter((q) => !samples.has(setIdOf(q.id)))
    const questionMap = new Map(bank.questions.map((q) => [q.id, q]))
    // サンプルを除外している間は、サンプルへの回答も集計に含めない
    const inScope = new Set(questions.map((q) => q.id))
    const scopedAttempts = attempts.filter((a) => inScope.has(a.questionId))
    const mastery = computeMastery(scopedAttempts, questionMap, now)
    const blockedIds = new Set(reports.filter((r) => r.active).map((r) => r.questionId))
    const topicName = (id: string) => bank.topics.get(id)?.name ?? id

    return {
      bank,
      questions,
      questionMap,
      topics: bank.topics,
      settings,
      attempts: scopedAttempts,
      reports,
      kartes,
      mastery,
      blockedIds,
      topicName,
      reload,
      updateSettings: async (patch) => {
        const next = { ...settings, ...patch }
        await saveSettings(next)
        setSettings(next)
      },
      recordAttempt: async (a) => {
        await db.attempts.add(a as Attempt)
        const all = await db.attempts.toArray()
        const scoredCount = scoredAttempts(all).length
        let created: Karte | null = null
        if (scoredCount > 0 && scoredCount % KARTE_EVERY === 0) {
          const exists = await db.kartes.where('attemptCount').equals(scoredCount).count()
          if (!exists) {
            const m = computeMastery(all, questionMap, Date.now())
            created = {
              createdAt: Date.now(),
              attemptCount: scoredCount,
              summary: buildKarte(all, questionMap, m, describePolicy(m, topicName)),
            }
            await db.kartes.add(created)
          }
        }
        await reload()
        return created
      },
      reportQuestion: async (questionId, reason, comment) => {
        await db.transaction('rw', [db.reports, db.attempts], async () => {
          await db.reports.add({ questionId, reason, comment, createdAt: Date.now(), active: true })
          // 問題の不備による回答は採点から外す（原指示文 §4）
          await db.attempts
            .where('questionId')
            .equals(questionId)
            .modify((a) => {
              if (!a.excluded) {
                a.excluded = true
                a.excludedReason = REPORTED
              }
            })
        })
        await reload()
      },
      withdrawReport: async (reportId) => {
        await db.transaction('rw', [db.reports, db.attempts], async () => {
          const r = await db.reports.get(reportId)
          if (!r) return
          await db.reports.update(reportId, { active: false })
          const stillReported = await db.reports
            .where('questionId')
            .equals(r.questionId)
            .filter((x) => x.active && x.id !== reportId)
            .count()
          if (stillReported === 0) {
            await db.attempts
              .where('questionId')
              .equals(r.questionId)
              .modify((a) => {
                if (a.excludedReason === REPORTED) {
                  a.excluded = false
                  delete a.excludedReason
                }
              })
          }
        })
        await reload()
      },
    }
  }, [bank, settings, attempts, reports, kartes, now, reload])

  if (error) {
    return (
      <div className="page">
        <p className="error">問題データを読み込めませんでした。通信状態を確認して再読み込みしてください。</p>
        <pre className="muted small">{error}</pre>
      </div>
    )
  }
  if (!value) return <div className="page loading">読み込み中…</div>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
