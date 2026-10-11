import { useState } from 'react'
import { useStore } from '../store'
import { navigate } from '../router'
import type { Field, QuizConfig, QuizMode } from '../types'
import { FIELD_NAMES } from '../types'
import { PageHeader } from '../components/ui'
import { sampleSetIds } from '../data'

const MODES: [QuizMode, string, string][] = [
  ['auto', 'おまかせ（おすすめ）', '弱点・復習時期・分野バランスを見て自動で出題'],
  ['weak', '苦手克服を優先', '要復習・学習中の論点をさらに多めに'],
  ['field', '分野を指定', '選んだ分野だけから出題'],
  ['exam', '年度を指定', '1回分を問題番号順に通しで'],
]
const COUNTS = [5, 10, 20, 0]

export default function Setup({ initial, onStart }: { initial: QuizConfig; onStart: (c: QuizConfig) => void }) {
  const s = useStore()
  const [c, setC] = useState<QuizConfig>(initial)
  const samples = sampleSetIds(s.bank)
  const sets = s.bank.sets.filter((x) => s.settings.includeSamples || !samples.has(x.id))
  const toggleField = (f: Field) =>
    setC({ ...c, fields: c.fields.includes(f) ? c.fields.filter((x) => x !== f) : [...c.fields, f] })
  const invalid = (c.mode === 'field' && c.fields.length === 0) || (c.mode === 'exam' && !c.examSetId)

  return (
    <div className="page">
      <PageHeader title="演習設定" />
      <section className="card">
        <h2>出題モード</h2>
        <div className="radio-list">
          {MODES.map(([m, label, desc]) => (
            <label key={m} className="radio">
              <input type="radio" name="mode" checked={c.mode === m} onChange={() => setC({ ...c, mode: m })} />
              <span>
                {label}
                <span className="muted small block">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {c.mode === 'field' && (
        <section className="card">
          <h2>分野</h2>
          <div className="chips">
            {(Object.keys(FIELD_NAMES) as Field[]).map((f) => (
              <button key={f} className={`chip ${c.fields.includes(f) ? 'on' : ''}`} aria-pressed={c.fields.includes(f)} onClick={() => toggleField(f)}>
                {FIELD_NAMES[f]}
              </button>
            ))}
          </div>
        </section>
      )}

      {c.mode === 'exam' && (
        <section className="card">
          <h2>年度</h2>
          <select value={c.examSetId ?? ''} onChange={(e) => setC({ ...c, examSetId: e.target.value || undefined })}>
            <option value="">選んでください</option>
            {sets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </section>
      )}

      <section className="card">
        <h2>1セットの問題数</h2>
        <div className="segmented">
          {COUNTS.map((n) => (
            <button key={n} className={c.count === n ? 'on' : ''} aria-pressed={c.count === n} onClick={() => setC({ ...c, count: n })}>
              {n === 0 ? '無制限' : n}
            </button>
          ))}
        </div>
      </section>

      <div className="actions sticky">
        <button className="btn primary" disabled={invalid} onClick={() => { onStart(c); navigate('quiz') }}>
          この設定ではじめる ▶
        </button>
      </div>
    </div>
  )
}
