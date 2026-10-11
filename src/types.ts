export type ChoiceLabel = 'ア' | 'イ' | 'ウ' | 'エ'
export const CHOICE_LABELS: ChoiceLabel[] = ['ア', 'イ', 'ウ', 'エ']

export type Field = 'technology' | 'management' | 'strategy'
export const FIELD_NAMES: Record<Field, string> = {
  technology: 'テクノロジ',
  management: 'マネジメント',
  strategy: 'ストラテジ',
}
/** 科目A 80問の分野配分（問1〜50 / 51〜60 / 61〜80） */
export const FIELD_TARGET_RATIO: Record<Field, number> = {
  technology: 50 / 80,
  management: 10 / 80,
  strategy: 20 / 80,
}

export type QuestionKind = 'past' | 'original'
export type QuestionType = 'knowledge' | 'calculation' | 'reading' | 'applied' | 'judgment'
export type VerificationStatus = 'verified' | 'disputed' | 'retired'

export interface Choice {
  label: ChoiceLabel
  text: string
  /** 選択肢が図の場合の画像パス（public/ からの相対） */
  image?: string
}

export interface Explanation {
  /** 正解の根拠（1〜3行） */
  basis: string
  /** 各選択肢の要点（ア〜エの順） */
  perChoice: Record<ChoiceLabel, string>
  /** 間違えやすい点・判断のポイント */
  pitfalls: string
  /** 詳しい解説 */
  detail?: string
  /** 計算問題の別解・検算 */
  altCalc?: string
}

export interface Question {
  id: string
  kind: QuestionKind
  /** 西暦の年度（例: 2025） */
  examYear: number
  season: 'spring' | 'autumn'
  section: 'A'
  number: number
  stem: string
  figures?: string[]
  choices: Choice[]
  answer: ChoiceLabel
  field: Field
  categoryLarge: string
  categoryMiddle: string
  topicIds: string[]
  questionType: QuestionType
  /** 1（易）〜5（難） */
  difficulty: number
  explanation: Explanation
  source: { label: string; url?: string }
  verification: { status: VerificationStatus; checks: string[]; notes?: string }
  validityNote?: string
}

export interface Topic {
  id: string
  name: string
  field: Field
  category: string
}

export interface ExamSet {
  id: string
  label: string
  file: string
  /** 動作確認用のサンプル（実際の過去問ではない） */
  sample?: boolean
}

export interface DataIndex {
  sets: ExamSet[]
  topicsFile: string
}

export type Confidence = 'sure' | 'maybe' | 'guess'

export interface Attempt {
  id?: number
  questionId: string
  answeredAt: number
  choice: ChoiceLabel | null
  gaveUp: boolean
  isCorrect: boolean
  confidence: Confidence | null
  timeSpentSec: number
  excluded: boolean
  excludedReason?: string
}

export type ReportReason =
  | 'stem'
  | 'choices'
  | 'answer'
  | 'figure'
  | 'outdated'
  | 'other'

export const REPORT_REASON_NAMES: Record<ReportReason, string> = {
  stem: '問題文の誤り',
  choices: '選択肢の誤り',
  answer: '正解が違う気がする',
  figure: '図が見えない・読めない',
  outdated: '現行制度と違う',
  other: 'その他',
}

export interface Report {
  id?: number
  questionId: string
  reason: ReportReason
  comment: string
  createdAt: number
  active: boolean
}

export type MasteryState = 'unseen' | 'learning' | 'review_due' | 'mastered'

export const MASTERY_NAMES: Record<MasteryState, string> = {
  unseen: '未学習',
  learning: '学習中',
  review_due: '要復習',
  mastered: '習得済み',
}

export interface TopicMastery {
  topicId: string
  state: MasteryState
  attempts: number
  correct: number
  wrong: number
  /** 異なる問題での連続正解数（勘の正解は数えない） */
  distinctCorrectStreak: number
  lastAnsweredAt: number | null
  lastCorrectAt: number | null
  nextReviewAt: number | null
  intervalDays: number
  lapseCount: number
}

export type QuizMode = 'auto' | 'weak' | 'field' | 'exam'

export interface QuizConfig {
  mode: QuizMode
  fields: Field[]
  examSetId?: string
  /** 0 は無制限 */
  count: number
}

export const AUTO_CONFIG: QuizConfig = { mode: 'auto', fields: [], count: 10 }

export interface Settings {
  showSourceBeforeAnswer: boolean
  dailyGoal: number
  examDate: string
  includeSamples: boolean
  lastExportAt: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  showSourceBeforeAnswer: true,
  dailyGoal: 20,
  examDate: '2026-11-15',
  includeSamples: true,
  lastExportAt: null,
}

export interface Karte {
  id?: number
  createdAt: number
  attemptCount: number
  summary: KarteSummary
}

export interface KarteSummary {
  overallRate: number | null
  overallN: number
  fieldRates: Record<Field, { rate: number | null; n: number }>
  weakTopics: string[]
  masteredTopics: string[]
  reviewTopics: string[]
  policy: string[]
}
