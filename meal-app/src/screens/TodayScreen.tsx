import { useRef, useState } from 'react'
import { CalorieRing, Meter } from '../components/Charts'
import { Sheet, SparkIcon, Thinking } from '../components/ui'
import { advicePrompt } from '../logic/claude'
import { addDays, relativeDay, todayKey } from '../logic/date'
import { sumItems, type Totals } from '../logic/nutrition'
import { photoUrl, sampleErrorText } from '../platform'
import { navigate } from '../router'
import { useStore } from '../store'
import { DEFAULT_PROFILE, SLOT_ICON, SLOT_LABEL, SLOTS, type Meal, type Slot } from '../types'

export default function TodayScreen({ date }: { date: string }) {
  const { targets, profile, dayOf, days, addWater, platform } = useStore()
  const p = profile ?? DEFAULT_PROFILE
  const day = dayOf(date)
  const meals = [...day.meals].sort((a, b) => a.createdAt - b.createdAt)
  const water = day.waterMl ?? 0
  const total = sumItems(meals.flatMap((m) => m.items))
  const isToday = date === todayKey()
  const go = (d: string) => navigate('today', { d: d === todayKey() ? undefined : d }, true)

  const buildPrompt = () => {
    let count = 0
    let all: Meal[] = []
    for (let i = 1; i <= 7; i++) {
      const ms = days[addDays(date, -i)]?.meals ?? []
      if (ms.length) {
        count++
        all = all.concat(ms)
      }
    }
    let weekAvg: Totals | null = null
    if (count > 0) {
      const t = sumItems(all.flatMap((m) => m.items))
      weekAvg = { kcal: Math.round(t.kcal / count), p: t.p / count, f: t.f / count, c: t.c / count }
    }
    const latest = Object.values(days)
      .filter((d) => d.weight)
      .sort((a, b) => a.date.localeCompare(b.date))
      .pop()?.weight?.kg
    return advicePrompt({ date, meals, targets, profile: p, waterMl: water, weekAvg, latestWeight: latest })
  }

  return (
    <div className="screen">
      <header className="date-bar">
        <button className="icon-btn" aria-label="前の日" onClick={() => go(addDays(date, -1))}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <label className="date-title">
          <span>{relativeDay(date)}</span>
          <input id="day-picker" type="date" value={date} aria-label="日付を選ぶ" onChange={(e) => e.target.value && go(e.target.value)} />
        </label>
        <button className="icon-btn" aria-label="次の日" disabled={isToday} onClick={() => go(addDays(date, 1))}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      {!profile && (
        <button className="card notice" onClick={() => navigate('settings', { setup: 1 })}>
          <b>はじめに目標を設定しましょう</b>
          <span>身長・体重などから、1日の目標カロリーを自動で計算します →</span>
        </button>
      )}

      <section className="card summary">
        <CalorieRing eaten={total.kcal} target={targets.kcal} />
        <div className="summary-side">
          <div className="summary-kcal">
            <span>食べた</span>
            <b>{total.kcal.toLocaleString()}</b>
            <span>/ {targets.kcal.toLocaleString()} kcal</span>
          </div>
          <Meter label="たんぱく質" value={total.p} target={targets.p} unit="g" tone="p" />
          <Meter label="脂質" value={total.f} target={targets.f} unit="g" tone="f" />
          <Meter label="炭水化物" value={total.c} target={targets.c} unit="g" tone="c" />
        </div>
      </section>

      <section className="slots">
        {SLOTS.map((slot) => (
          <SlotCard key={slot} slot={slot} date={date} meals={meals.filter((m) => m.slot === slot)} />
        ))}
      </section>

      <section className="card water">
        <div className="water-head">
          <h2>
            <span aria-hidden="true">💧</span> 水分
          </h2>
          <span className="water-num">
            <b>{(water / 1000).toFixed(1)}</b> / {(p.waterTargetMl / 1000).toFixed(1)} L
          </span>
        </div>
        <div className="cups" aria-hidden="true">
          {Array.from({ length: Math.min(Math.ceil(p.waterTargetMl / p.cupMl), 20) }, (_, i) => (
            <span key={i} className={i < Math.floor(water / p.cupMl) ? 'cup full' : 'cup'} />
          ))}
        </div>
        <div className="water-actions">
          <button className="btn btn-outline" aria-label={`${p.cupMl}ml 減らす`} disabled={water <= 0} onClick={() => addWater(date, -p.cupMl)}>
            −
          </button>
          <button className="btn btn-water grow" onClick={() => addWater(date, p.cupMl)}>
            ＋ コップ1杯（{p.cupMl}ml）
          </button>
        </div>
      </section>

      {platform?.sample && <AdviceCard buildPrompt={buildPrompt} />}
    </div>
  )
}

function AdviceCard({ buildPrompt }: { buildPrompt: () => string }) {
  const { platform } = useStore()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ctl = useRef<AbortController | null>(null)

  const ask = async () => {
    const sample = platform?.sample
    if (!sample) return
    setOpen(true)
    setText('')
    setError('')
    setBusy(true)
    ctl.current = new AbortController()
    try {
      const r = await sample(buildPrompt(), { signal: ctl.current.signal, onText: ({ text }) => setText(text) })
      setText(r.text)
      if (r.truncated) setError('回答が途中で切れました')
    } catch (e) {
      setText((e as { text?: string }).text ?? '')
      setError(sampleErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    ctl.current?.abort()
    setOpen(false)
  }

  return (
    <section className="card ai-card">
      <div className="ai-head">
        <span className="ai-badge">
          <SparkIcon />
        </span>
        <div>
          <h2>Claude にアドバイスをもらう</h2>
          <p>この日の食事・目標・直近の傾向から、良い点と改善点を教えてくれます。</p>
        </div>
      </div>
      <button className="btn btn-claude block" onClick={ask} disabled={busy}>
        <SparkIcon /> アドバイスをもらう
      </button>
      <Sheet open={open} onClose={close} title="Claude からのアドバイス">
        {busy && !text && <Thinking label="考えています…（数十秒かかることがあります）" onStop={() => ctl.current?.abort()} />}
        {text && <div className="advice">{text}</div>}
        {busy && text && <Thinking label="書いています…" onStop={() => ctl.current?.abort()} />}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!busy && (
          <button className="btn btn-outline block" onClick={close}>
            閉じる
          </button>
        )}
      </Sheet>
    </section>
  )
}

function SlotCard({ slot, date, meals }: { slot: Slot; date: string; meals: Meal[] }) {
  const items = meals.flatMap((m) => m.items)
  const t = sumItems(items)
  const open = (id?: string) => navigate('meal', { date, slot, id })
  return (
    <article className="card slot-card">
      <header className="slot-head">
        <h2>
          <span aria-hidden="true">{SLOT_ICON[slot]}</span> {SLOT_LABEL[slot]}
        </h2>
        {items.length > 0 && <span className="slot-kcal">{t.kcal} kcal</span>}
        <button className="add-btn" aria-label={`${SLOT_LABEL[slot]}を追加`} onClick={() => open()}>
          ＋
        </button>
      </header>
      {meals.length === 0 ? (
        <button className="slot-empty" onClick={() => open()}>
          タップして記録
        </button>
      ) : (
        <ul className="meal-list">
          {meals.map((m) => (
            <MealRow key={m.id} meal={m} onClick={() => open(m.id)} />
          ))}
        </ul>
      )}
    </article>
  )
}

function MealRow({ meal, onClick }: { meal: Meal; onClick: () => void }) {
  const t = sumItems(meal.items)
  return (
    <li>
      <button className="meal-row" onClick={onClick}>
        {meal.photoId ? (
          <img src={photoUrl(meal.photoId)} alt="" className="thumb" loading="lazy" />
        ) : (
          <span className="thumb thumb-empty" aria-hidden="true">
            🍽️
          </span>
        )}
        <span className="meal-row-main">
          <span className="meal-row-names">{meal.items.length ? meal.items.map((i) => i.name).join('、') : '（品目なし）'}</span>
          <span className="meal-row-sub">
            {t.kcal} kcal · P{Math.round(t.p)} F{Math.round(t.f)} C{Math.round(t.c)}
            {meal.estimated && <span className="tag">推定</span>}
          </span>
        </span>
      </button>
    </li>
  )
}
