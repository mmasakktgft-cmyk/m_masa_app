import { useEffect, useMemo, useState } from 'react'
import { LineChart } from '../components/Charts'
import { NumInput, Segmented, TopBar } from '../components/ui'
import { addDays, formatDay, todayKey } from '../logic/date'
import { bmi, round1 } from '../logic/nutrition'
import { useStore } from '../store'
import { DEFAULT_PROFILE } from '../types'

type Span = '30' | '90' | '365'

export default function BodyScreen() {
  const { profile, updateProfile, toast, days, dayOf, changeDay } = useStore()
  const p = profile ?? DEFAULT_PROFILE
  const [date, setDate] = useState(todayKey())
  const [kg, setKg] = useState<number | undefined>()
  const [fat, setFat] = useState<number | undefined>()
  const [span, setSpan] = useState<Span>('30')
  const all = useMemo(
    () =>
      Object.values(days)
        .filter((d) => d.weight)
        .map((d) => ({ date: d.date, kg: d.weight!.kg, bodyFat: d.weight!.bodyFat }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [days],
  )

  // 選んだ日に記録があれば入力欄に出す（上書き編集できるように）
  useEffect(() => {
    const w = dayOf(date).weight
    setKg(w?.kg)
    setFat(w?.bodyFat)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const from = addDays(todayKey(), -Number(span) + 1)
  const shown = all.filter((w) => w.date >= from)
  const latest = all[all.length - 1]
  const first = shown[0]
  const diff = latest && first && latest !== first ? round1(latest.kg - first.kg) : null

  const save = async () => {
    if (!kg) return
    await changeDay(date, (d) => {
      d.weight = { kg: round1(kg), ...(fat ? { bodyFat: round1(fat) } : {}) }
      return d
    })
    // 最新の体重で目標カロリーを計算し直す
    if (profile && (!latest || date >= latest.date)) await updateProfile({ ...profile, weightKg: round1(kg) })
    toast('体重を記録しました')
  }

  return (
    <div className="screen">
      <TopBar title="体重" />

      <section className="card">
        <div className="weight-form">
          <label className="field" htmlFor="weight-date">
            <span>日付</span>
            <input id="weight-date" type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <div className="weight-inputs">
            <label className="field big">
              <span>体重 kg</span>
              <NumInput label="体重" step={0.1} value={kg} placeholder={latest ? String(latest.kg) : '60.0'} onChange={setKg} />
            </label>
            <label className="field">
              <span>体脂肪率 %</span>
              <NumInput label="体脂肪率" step={0.1} value={fat} placeholder="任意" onChange={setFat} />
            </label>
          </div>
          <button className="btn btn-primary block" disabled={!kg} onClick={save}>
            記録する
          </button>
        </div>
      </section>

      <section className="stat-row">
        <div className="card stat">
          <span className="stat-label">現在</span>
          <b className="stat-value">{latest ? latest.kg.toFixed(1) : '—'}</b>
          <span className="stat-unit">kg</span>
        </div>
        <div className="card stat">
          <span className="stat-label">BMI</span>
          <b className="stat-value">{latest ? bmi(p.heightCm, latest.kg).toFixed(1) : '—'}</b>
          <span className="stat-unit">{p.heightCm}cm</span>
        </div>
        <div className="card stat">
          <span className="stat-label">期間の増減</span>
          <b className="stat-value">{diff === null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff).toFixed(1)}`}</b>
          <span className="stat-unit">kg</span>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>推移</h2>
        </div>
        <Segmented
          label="期間"
          value={span}
          onChange={setSpan}
          options={[
            { value: '30', label: '1か月' },
            { value: '90', label: '3か月' },
            { value: '365', label: '1年' },
          ]}
        />
        <LineChart points={shown.map((w) => ({ date: w.date, value: w.kg }))} unit="kg" label="体重" />
      </section>

      {shown.length > 0 && (
        <section className="card">
          <details>
            <summary className="section-summary">記録の一覧（{shown.length}件）</summary>
            <table className="table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>体重</th>
                  <th>体脂肪率</th>
                </tr>
              </thead>
              <tbody>
                {[...shown].reverse().map((w) => (
                  <tr key={w.date} onClick={() => setDate(w.date)}>
                    <td>{formatDay(w.date)}</td>
                    <td>{w.kg.toFixed(1)} kg</td>
                    <td>{w.bodyFat ? `${w.bodyFat.toFixed(1)} %` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}
    </div>
  )
}
