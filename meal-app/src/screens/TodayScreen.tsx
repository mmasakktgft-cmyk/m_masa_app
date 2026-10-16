import { CalorieRing, Meter } from '../components/Charts'
import { SparkIcon } from '../components/ui'
import { addWater, db, useLive } from '../db'
import { advicePrompt, openClaude } from '../logic/claude'
import { addDays, relativeDay, todayKey } from '../logic/date'
import { useObjectUrl } from '../logic/image'
import { sumItems, type Totals } from '../logic/nutrition'
import { navigate } from '../router'
import { useStore } from '../store'
import { DEFAULT_PROFILE, SLOT_ICON, SLOT_LABEL, SLOTS, type Meal, type Slot } from '../types'

export default function TodayScreen({ date }: { date: string }) {
  const { targets, profile, toast } = useStore()
  const p = profile ?? DEFAULT_PROFILE
  const meals = useLive(() => db.meals.where('date').equals(date).sortBy('createdAt'), [date], [] as Meal[])
  const water = useLive(async () => (await db.water.get(date))?.ml ?? 0, [date], 0)
  const total = sumItems(meals.flatMap((m) => m.items))
  const isToday = date === todayKey()

  const askClaude = async () => {
    const from = addDays(date, -7)
    const prev = await db.meals.where('date').between(from, date, true, false).toArray()
    const days = new Set(prev.map((m) => m.date)).size
    let weekAvg: Totals | null = null
    if (days > 0) {
      const t = sumItems(prev.flatMap((m) => m.items))
      weekAvg = { kcal: Math.round(t.kcal / days), p: t.p / days, f: t.f / days, c: t.c / days }
    }
    const latest = await db.weights.orderBy('date').last()
    const prompt = advicePrompt({ date, meals, targets, profile: p, waterMl: water, weekAvg, latestWeight: latest?.kg })
    await openClaude(prompt)
    toast('食事の内容をコピーしました。Claude に貼り付けて送信してください')
  }

  return (
    <div className="screen">
      <header className="date-bar">
        <button className="icon-btn" aria-label="前の日" onClick={() => navigate('today', { d: addDays(date, -1) }, true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <label className="date-title">
          <span>{relativeDay(date)}</span>
          <input
            type="date"
            value={date}
            aria-label="日付を選ぶ"
            onChange={(e) => e.target.value && navigate('today', { d: e.target.value === todayKey() ? undefined : e.target.value }, true)}
          />
        </label>
        <button
          className="icon-btn"
          aria-label="次の日"
          disabled={isToday}
          onClick={() => {
            const next = addDays(date, 1)
            navigate('today', { d: next === todayKey() ? undefined : next }, true)
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      {!profile && (
        <a className="card notice" href="#/settings?setup=1">
          <b>はじめに目標を設定しましょう</b>
          <span>身長・体重などから、1日の目標カロリーを自動で計算します →</span>
        </a>
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

      <section className="card ai-card">
        <div className="ai-head">
          <span className="ai-badge">
            <SparkIcon />
          </span>
          <div>
            <h2>Claude にアドバイスをもらう</h2>
            <p>この日の食事・目標・直近の傾向をまとめて Claude に送ります（無料プランで利用できます）。</p>
          </div>
        </div>
        <button className="btn btn-claude block" onClick={askClaude}>
          <SparkIcon /> 食事内容をコピーして Claude を開く
        </button>
      </section>
    </div>
  )
}

function SlotCard({ slot, date, meals }: { slot: Slot; date: string; meals: Meal[] }) {
  const items = meals.flatMap((m) => m.items)
  const t = sumItems(items)
  const open = (id?: number) => navigate('meal', { date, slot, id })
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
  const url = useObjectUrl(meal.photo)
  const t = sumItems(meal.items)
  return (
    <li>
      <button className="meal-row" onClick={onClick}>
        {url ? <img src={url} alt="" className="thumb" /> : <span className="thumb thumb-empty" aria-hidden="true">🍽️</span>}
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
