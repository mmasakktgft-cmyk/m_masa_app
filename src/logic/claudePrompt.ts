import type { Attempt, Question } from '../types'

/** 「Claude に質問」でコピーする文面 */
export function buildClaudePrompt(q: Question, attempt: Attempt | null, userQuestion: string): string {
  const choices = q.choices.map((c) => `${c.label}　${c.image ? '（図）' : c.text}`).join('\n')
  const mine = attempt ? (attempt.gaveUp ? 'わからなかった' : (attempt.choice ?? '—')) : '—'
  const lines = [
    `${q.kind === 'past' ? q.source.label : `応用情報技術者試験の練習問題（${q.source.label}）`}について質問です。`,
    '',
    '【問題】',
    q.stem + (q.figures?.length ? '\n（図あり）' : ''),
    '',
    '【選択肢】',
    choices,
    '',
    `【正解】${q.answer}　【私の回答】${mine}`,
    '',
    '【アプリの解説】',
    q.explanation.basis,
    '',
    '【質問】',
    userQuestion.trim() || '（ここに質問を書いてください）',
  ]
  return lines.join('\n')
}
