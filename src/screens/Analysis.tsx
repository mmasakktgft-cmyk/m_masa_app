import { useState } from 'react'
import { useStore } from '../store'
import { navigate } from '../router'
import {
  fieldStats, improvedTopics, lastN, MIN_RELIABLE_N, pct, priorities, rate,
  repeatedMistakes, topicsByState, trend,
} from '../logic/stats'
import type { Field } from '../types'
import { FIELD_NAMES } from '../types'
import { PageHeader, RateBar, Sparkline } from '../components/ui'

const WINDOWS: [number, string][] = [
  [10, '直近10問'],
  [50, '直近50問'],
  [0, '全期間'],
]

export default function Analysis() {
  const s = useStore()
  const [win, setWin] = useState(10)
  const all = lastN(s.attempts, Infinity)
  const scope = win === 0 ? all : all.slice(-win)
  const r = rate(scope)
  const short = win > 0 && all.length < win
  const fs = fieldStats(scope, s.questionMap)
  const mistakes = repeatedMistakes(s.mastery)
  const improved = improvedTopics(s.mastery)
  const mastered = topicsByState(s.mastery, 'mastered')
  const prio = priorities(s.attempts, s.questionMap, s.mastery, (t) => s.topics.get(t)?.field)
  const excludedCount = s.attempts.filter((a) => a.excluded).length

  return (
    <div className="page">
      <PageHeader title="これまでの傾向分析" />
      {all.length === 0 ? (
        <div className="card center">
          <p>まだ回答がありません。演習をはじめると、ここに傾向が表示されます。</p>
        </div>
      ) : (
        <>
          <div className="segmented tabs" role="tablist">
            {WINDOWS.map(([n, label]) => (
              <button key={n} role="tab" aria-selected={win === n} className={win === n ? 'on' : ''} onClick={() => setWin(n)}>
                {label}
              </button>
            ))}
          </div>

          <section className="card">
            {short && (
              <p className="notice static small">
                まだ {all.length} 問です。{WINDOWS.find((w) => w[0] === win)?.[1]}の集計は、あと {win - all.length} 問で揃います（現在は {all.length} 問分を表示）。
              </p>
            )}
            <div className="row">
              <span className="grow">正答率</span>
              <span className="big">{pct(r.rate)}</span>
              <span className="muted small">（{r.correct}/{r.n}）</span>
            </div>
            {r.n < MIN_RELIABLE_N && <p className="muted small">問題数が少ないため参考値です。</p>}
            {win === 0 && trend(all).length >= 2 && (
              <>
                <p className="muted small">10問ごとの推移（点線は60%）</p>
                <Sparkline values={trend(all)} />
              </>
            )}
          </section>

          <section className="card">
            <h2>分野別</h2>
            {(Object.keys(FIELD_NAMES) as Field[]).map((f) => (
              <RateBar key={f} label={FIELD_NAMES[f]} rate={fs[f].rate} n={fs[f].n} minN={MIN_RELIABLE_N} />
            ))}
          </section>
        </>
      )}

      <section className="card">
        <h2>繰り返し間違える論点</h2>
        {mistakes.length === 0 ? (
          <p className="muted small">2回以上間違えた論点はまだありません。</p>
        ) : (
          <ol className="bullets">
            {mistakes.slice(0, 8).map((m) => (
              <li key={m.topicId}>{s.topicName(m.topicId)} <span className="muted small">（{m.wrong}回誤答／{m.attempts}回）</span></li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h2>改善した論点・習得済み</h2>
        {improved.length === 0 && mastered.length === 0 && <p className="muted small">まだありません。</p>}
        <div className="chips">
          {improved.map((t) => <span key={t} className="chip static">↗ {s.topicName(t)}</span>)}
          {mastered.map((t) => <span key={t} className="chip static ok">✔ {s.topicName(t)}</span>)}
        </div>
        <p className="muted small">習得済み＝異なる2問以上で、3日以上空けて連続正解した論点（「勘」の正解は除く）。</p>
      </section>

      <section className="card">
        <h2>今後の学習優先順位</h2>
        <ol className="bullets">
          {prio.map((p) => (
            <li key={p.field}>{FIELD_NAMES[p.field]} <span className="muted small">— {p.reason}</span></li>
          ))}
        </ol>
        <p className="muted small">正答率は目安です。合格可能性を示すものではありません。</p>
      </section>

      {excludedCount > 0 && <p className="muted small pad">不備報告により {excludedCount} 件の回答を採点から除外しています。</p>}

      <div className="actions sticky">
        <button className="btn" onClick={() => navigate('karte')}>学習カルテ</button>
        <button className="btn primary" onClick={() => history.back()}>戻る</button>
      </div>
    </div>
  )
}
