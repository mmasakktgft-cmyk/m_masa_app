import type { DataIndex, ExamSet, Question, Topic } from './types'

export interface QuestionBank {
  sets: ExamSet[]
  questions: Question[]
  topics: Map<string, Topic>
}

const base = import.meta.env.BASE_URL

export function assetUrl(path: string): string {
  return base + path.replace(/^\//, '')
}

export async function loadBank(): Promise<QuestionBank> {
  const index: DataIndex = await (await fetch(assetUrl('data/index.json'))).json()
  const topicList: Topic[] = await (await fetch(assetUrl(index.topicsFile))).json()
  const perSet = await Promise.all(
    index.sets.map(async (s) => (await (await fetch(assetUrl(s.file))).json()) as Question[]),
  )
  return {
    sets: index.sets,
    questions: perSet.flat(),
    topics: new Map(topicList.map((t) => [t.id, t])),
  }
}

export function sampleSetIds(bank: QuestionBank): Set<string> {
  return new Set(bank.sets.filter((s) => s.sample).map((s) => s.id))
}

/** 問題IDの先頭は所属セットのID（例: AP-R07A-AM-01 → AP-R07A） */
export function setIdOf(questionId: string): string {
  return questionId.split('-').slice(0, 2).join('-')
}
