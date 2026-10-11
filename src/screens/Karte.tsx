import { useState } from 'react'
import { useStore } from '../store'
import { buildKarte, KARTE_EVERY, pct } from '../logic/stats'
import { describePolicy } from '../logic/selector'
import { scoredAttempts } from '../logic/mastery'
import type { Field, KarteSummary } from '../types'
import { FIELD_NAMES } from '../types'
import { PageHeader } from '../components/ui'

export default function KarteScreen() {
  const s = useStore()
  const saved = [...s.kartes].sort((a, b) => b.createdAt - a.createdAt)
  const [idx, setIdx] = useState(-1) // -1 = 現在の状態
  const scoredCount = scoredAttempts(s.attempts).length
  const current: KarteSummary = buildKarte(s.attempts, s.questionMap, s.mastery, describePolicy(s.mastery, s.topicName))
  const shown = idx === -1 ? current : saved[idx].summary
  const prev = idx === -1 ? saved[0]?.summary : saved[idx + 1]?.summary
  const toNext = KARTE_EVERY - (scoredCount % KARTE_EVERY)

  return (
    <div className="page">
      <PageHeader title="学習カルテ" back="analysis" />
      <section className="card">
        <label className="field">
          <span>表示するカルテ</span>
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            <option value={-1}>現在の状態（{scoredCount}問）</option>
            {saved.map((k, i) => (
              <option key={k.id} value={i}>
                {k.attemptCount}問時点（{new Date(k.createdAt).toLocaleDateString('ja-JP')}）
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">{KARTE_EVERY}問ごとに自動で保存します。次の保存まであと {toNext} 問。</p>
      </section>

      <section className="card">
        <h2>正答率</h2>
        <div className="row">
          <span className="grow">総合</span>
          <b>{pct(shown.overallRate)}</b>
          <span className="muted small">n={shown.overallN}</span>
          {prev && <Diff now={shown.overallRate} before={prev.overallRate} />}
        </div>
        {(Object.keys(FIELD_NAMES) as Field[]).map((f) => (
          <div key={f} className="row">
            <span className="grow">{FIELD_NAMES[f]}</span>
            <span>{pct(shown.fieldRates[f].rate)}</span>
            <span className="muted small">n={shown.fieldRates[f].n}</span>
            {prev && <Diff now={shown.fieldRates[f].rate} before={prev.fieldRates[f].rate} />}
          </div>
        ))}
      </section>

      <TopicList title="弱点（繰り返し間違える論点）" ids={shown.weakTopics} name={s.topicName} />
      <TopicList title="要復習の論点" ids={shown.reviewTopics} name={s.topicName} />
      <TopicList title="習得済みの論点" ids={shown.masteredTopics} name={s.topicName} />

      <section className="card">
        <h2>出題方針</h2>
        <ul className="bullets">{shown.policy.map((p, i) => <li key={i}>{p}</li>)}</ul>
      </section>
      <p className="muted small pad">カルテは、この端末のブラウザ内に保存されています。機種変更の前には設定画面からエクスポートしてください。</p>
    </div>
  )
}

function Diff({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return <span className="diff" />
  const d = Math.round((now - before) * 100)
  if (d === 0) return <span className="diff muted small">±0</span>
  return <span className={`diff small ${d > 0 ? 'ok' : 'ng'}`}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>
}

function TopicList({ title, ids, name }: { title: string; ids: string[]; name: (id: string) => string }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {ids.length === 0 ? <p className="muted small">なし</p> : (
        <div className="chips">{ids.map((t) => <span key={t} className="chip static">{name(t)}</span>)}</div>
      )}
    </section>
  )
}
