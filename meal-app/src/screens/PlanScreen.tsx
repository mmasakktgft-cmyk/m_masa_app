import { useState } from 'react'
import { NumInput, ReplyImporter, Segmented, Sheet, SparkIcon, TopBar } from '../components/ui'
import { db, useLive } from '../db'
import { copyText, openClaude, planPrompt } from '../logic/claude'
import { addDays, formatDay, range, relativeDay, todayKey, weekStart } from '../logic/date'
import { aggregateIngredients } from '../logic/shopping'
import { navigate } from '../router'
import { useStore } from '../store'
import { SLOT_ICON, SLOT_LABEL, SLOTS, type PlanEntry, type ShoppingItem, type Slot } from '../types'

type Tab = 'plan' | 'shop'

export default function PlanScreen({ tab, week }: { tab: Tab; week: string }) {
  return (
    <div className="screen">
      <TopBar title="献立・買い物" />
      <Segmented
        label="表示"
        value={tab}
        onChange={(t) => navigate('plan', { tab: t === 'plan' ? undefined : t, w: week === weekStart(todayKey()) ? undefined : week }, true)}
        options={[
          { value: 'plan', label: '🗓️ 献立' },
          { value: 'shop', label: '🛒 買い物リスト' },
        ]}
      />
      {tab === 'plan' ? <PlanTab week={week} /> : <ShopTab />}
    </div>
  )
}

// ---- 献立 ----

interface Draft {
  id?: number
  date: string
  slot: Slot
  title: string
  kcal?: number
  ingredients: string
}

function PlanTab({ week }: { week: string }) {
  const { toast } = useStore()
  const days = range(week, 7)
  const plans = useLive(() => db.plans.where('date').between(days[0], days[6], true, true).toArray(), [week], [] as PlanEntry[])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const today = todayKey()
  const goWeek = (w: string) => navigate('plan', { w: w === weekStart(today) ? undefined : w }, true)

  const logAsMeal = async (p: PlanEntry) => {
    const mealId = await db.meals.add({
      date: p.date,
      slot: p.slot,
      items: [{ name: p.title, kcal: p.kcal ?? 0 }],
      memo: p.ingredients.length ? `献立より：${p.ingredients.join('、')}` : '献立より',
      createdAt: Date.now(),
    })
    await db.plans.update(p.id!, { loggedMealId: mealId })
    toast('食事記録に追加しました。必要なら記録画面で PFC を追加してください')
  }

  const saveDraft = async () => {
    if (!draft || !draft.title.trim()) return
    const entry: PlanEntry = {
      date: draft.date,
      slot: draft.slot,
      title: draft.title.trim(),
      kcal: draft.kcal,
      ingredients: draft.ingredients
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    if (draft.id !== undefined) await db.plans.update(draft.id, { ...entry })
    else await db.plans.add(entry)
    setDraft(null)
  }

  return (
    <>
      <div className="week-bar">
        <button className="icon-btn" aria-label="前の週" onClick={() => goWeek(addDays(week, -7))}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span>
          {formatDay(days[0])} 〜 {formatDay(days[6])}
        </span>
        <button className="icon-btn" aria-label="次の週" onClick={() => goWeek(addDays(week, 7))}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <button className="card ai-card ai-cta" onClick={() => setAiOpen(true)}>
        <span className="ai-badge">
          <SparkIcon />
        </span>
        <span className="grow">
          <b>Claude に献立を考えてもらう</b>
          <small>目標カロリーに合わせた献立を作り、そのまま取り込めます</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      {days.map((d) => {
        const dayPlans = plans.filter((p) => p.date === d).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
        const kcal = dayPlans.reduce((s, p) => s + (p.kcal ?? 0), 0)
        return (
          <section key={d} className={d === today ? 'card day-card today' : 'card day-card'}>
            <header className="day-head">
              <h2>{d === today ? `今日 ${formatDay(d)}` : formatDay(d)}</h2>
              {kcal > 0 && <span className="slot-kcal">{kcal} kcal</span>}
              <button className="add-btn" aria-label={`${formatDay(d)}の献立を追加`} onClick={() => setDraft({ date: d, slot: 'dinner', title: '', ingredients: '' })}>
                ＋
              </button>
            </header>
            {dayPlans.length === 0 ? (
              <p className="day-empty">未定</p>
            ) : (
              <ul className="plan-list">
                {dayPlans.map((p) => (
                  <li key={p.id} className="plan-row">
                    <button
                      className="plan-main"
                      onClick={() => setDraft({ id: p.id, date: p.date, slot: p.slot, title: p.title, kcal: p.kcal, ingredients: p.ingredients.join('\n') })}
                    >
                      <span className="plan-slot">
                        {SLOT_ICON[p.slot]} {SLOT_LABEL[p.slot]}
                      </span>
                      <b>{p.title}</b>
                      <small>
                        {p.kcal ? `${p.kcal} kcal` : ''}
                        {p.ingredients.length ? ` · ${p.ingredients.length}品目の食材` : ''}
                      </small>
                    </button>
                    {p.loggedMealId ? (
                      <span className="tag done">記録済</span>
                    ) : (
                      <button className="chip" onClick={() => logAsMeal(p)}>
                        食べた
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <Sheet open={draft !== null} onClose={() => setDraft(null)} title={draft?.id !== undefined ? '献立を編集' : '献立を追加'}>
        {draft && (
          <div className="form">
            <p className="hint">{relativeDay(draft.date)}</p>
            <Segmented label="区分" value={draft.slot} onChange={(slot) => setDraft({ ...draft, slot })} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />
            <label className="field">
              <span>料理名</span>
              <input value={draft.title} placeholder="例：鮭の塩焼き定食" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="field">
              <span>カロリー（目安）</span>
              <NumInput label="カロリー" value={draft.kcal} placeholder="kcal" onChange={(kcal) => setDraft({ ...draft, kcal })} />
            </label>
            <label className="field">
              <span>食材（1行に1つ。「食材 分量」）</span>
              <textarea rows={4} value={draft.ingredients} placeholder={'鮭 1切れ\nほうれん草 1/2束'} onChange={(e) => setDraft({ ...draft, ingredients: e.target.value })} />
            </label>
            <button className="btn btn-primary block" disabled={!draft.title.trim()} onClick={saveDraft}>
              保存
            </button>
            {draft.id !== undefined && (
              <button
                className="btn btn-ghost danger block"
                onClick={async () => {
                  await db.plans.delete(draft.id!)
                  setDraft(null)
                }}
              >
                この献立を削除
              </button>
            )}
          </div>
        )}
      </Sheet>

      <AiPlanSheet open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  )
}

function AiPlanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { targets, toast } = useStore()
  const tomorrow = addDays(todayKey(), 1)
  const [start, setStart] = useState(tomorrow)
  const [days, setDays] = useState('3')
  const [slots, setSlots] = useState<Slot[]>(['breakfast', 'lunch', 'dinner'])
  const [wishes, setWishes] = useState('')

  const toggle = (s: Slot) => setSlots((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : SLOTS.filter((x) => x === s || xs.includes(x))))

  const send = async () => {
    await openClaude(planPrompt({ startDate: start, days: Number(days), slots, targets, wishes: wishes.trim() || undefined }))
    toast('依頼文をコピーしました。Claude で送信してください')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Claude に献立を考えてもらう">
      <div className="form">
        <label className="field">
          <span>開始日</span>
          <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        <div className="field">
          <span>日数</span>
          <Segmented label="日数" value={days} onChange={setDays} options={['1', '3', '5', '7'].map((d) => ({ value: d, label: `${d}日` }))} />
        </div>
        <div className="field">
          <span>対象の食事</span>
          <div className="chips">
            {SLOTS.map((s) => (
              <button key={s} className={slots.includes(s) ? 'chip on' : 'chip'} aria-pressed={slots.includes(s)} onClick={() => toggle(s)}>
                {SLOT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>希望（任意）</span>
          <textarea rows={2} value={wishes} placeholder="例：平日は15分以内、魚多め、予算控えめ" onChange={(e) => setWishes(e.target.value)} />
        </label>
        <p className="hint">1日の目標 {targets.kcal}kcal（P{targets.p} F{targets.f} C{targets.c}g）を伝えます。</p>
        <ol className="steps">
          <li>
            <span className="step-no">1</span>
            <button className="btn btn-claude block" disabled={slots.length === 0} onClick={send}>
              <SparkIcon /> 依頼文をコピーして Claude を開く
            </button>
          </li>
          <li>
            <span className="step-no">2</span>
            <div className="grow">
              <p className="step-text">回答をコピーして戻り、取り込み</p>
              <ReplyImporter
                expect="plans"
                onParsed={async (r) => {
                  if (r.kind !== 'plans') return
                  await db.plans.bulkAdd(r.plans)
                  toast(`${r.plans.length}件の献立を取り込みました`)
                  onClose()
                  const w = weekStart(r.plans[0].date)
                  navigate('plan', { w: w === weekStart(todayKey()) ? undefined : w }, true)
                }}
              />
            </div>
          </li>
        </ol>
      </div>
    </Sheet>
  )
}

// ---- 買い物リスト ----

function ShopTab() {
  const { toast } = useStore()
  const items = useLive(() => db.shopping.orderBy('createdAt').toArray(), [], [] as ShoppingItem[])
  const [text, setText] = useState('')
  const todo = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  const fromPlans = async () => {
    const today = todayKey()
    const plans = await db.plans.where('date').between(today, addDays(today, 6), true, true).toArray()
    const lines = aggregateIngredients(plans)
    if (lines.length === 0) {
      toast('これから7日間の献立に食材が登録されていません')
      return
    }
    await db.transaction('rw', db.shopping, async () => {
      // 前回献立から作った未購入の行は作り直す（手入力の行と購入済みは残す）
      const old = await db.shopping.filter((i) => i.fromPlan && !i.done).primaryKeys()
      await db.shopping.bulkDelete(old)
      const now = Date.now()
      await db.shopping.bulkAdd(lines.map((name, i) => ({ name, done: false, fromPlan: true, createdAt: now + i })))
    })
    toast(`${lines.length}品目をリストにしました`)
  }

  const add = async () => {
    const names = text
      .split(/[\n、,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!names.length) return
    const now = Date.now()
    await db.shopping.bulkAdd(names.map((name, i) => ({ name, done: false, fromPlan: false, createdAt: now + i })))
    setText('')
  }

  const share = async () => {
    const body = todo.map((i) => `・${i.name}`).join('\n')
    if (navigator.share) {
      try {
        await navigator.share({ title: '買い物リスト', text: `買い物リスト\n${body}` })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    await copyText(body)
    toast('リストをコピーしました')
  }

  return (
    <>
      <button className="btn btn-tonal block" onClick={fromPlans}>
        🗓️ これから7日分の献立から作る
      </button>

      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input value={text} placeholder="追加する（例：牛乳、卵）" aria-label="買う物" onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" disabled={!text.trim()}>
          追加
        </button>
      </form>

      <section className="card">
        <div className="section-head">
          <h2>買う物（{todo.length}）</h2>
          {todo.length > 0 && (
            <button className="chip" onClick={share}>
              共有
            </button>
          )}
        </div>
        {todo.length === 0 ? (
          <p className="empty">リストは空です</p>
        ) : (
          <ul className="shop-list">
            {todo.map((i) => (
              <ShopRow key={i.id} item={i} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="card muted-card">
          <div className="section-head">
            <h2>購入済み（{done.length}）</h2>
            <button className="chip" onClick={() => db.shopping.bulkDelete(done.map((i) => i.id!))}>
              まとめて消す
            </button>
          </div>
          <ul className="shop-list">
            {done.map((i) => (
              <ShopRow key={i.id} item={i} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function ShopRow({ item }: { item: ShoppingItem }) {
  return (
    <li className={item.done ? 'shop-row done' : 'shop-row'}>
      <label>
        <input type="checkbox" checked={item.done} onChange={(e) => db.shopping.update(item.id!, { done: e.target.checked })} />
        <span>{item.name}</span>
      </label>
      <button className="icon-btn small" aria-label={`${item.name}を削除`} onClick={() => db.shopping.delete(item.id!)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  )
}
