import { useRef, useState } from 'react'
import { NumInput, Segmented, Sheet, SparkIcon, Thinking, TopBar } from '../components/ui'
import { suggestPlans } from '../logic/claude'
import { addDays, formatDay, range, relativeDay, todayKey, weekStart } from '../logic/date'
import { aggregateIngredients } from '../logic/shopping'
import { sampleErrorText } from '../platform'
import { navigate } from '../router'
import { useStore } from '../store'
import { newId, SLOT_ICON, SLOT_LABEL, SLOTS, type PlanEntry, type ShoppingItem, type Slot } from '../types'

type Tab = 'plan' | 'shop'

export default function PlanScreen({ tab, week }: { tab: Tab; week: string }) {
  return (
    <div className="screen">
      <TopBar title="献立・買い物" />
      <Segmented
        label="表示"
        value={tab}
        onChange={(t) => navigate('plan', { tab: t === 'plan' ? undefined : t, w: week }, true)}
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
  id?: string
  date: string
  slot: Slot
  title: string
  kcal?: number
  ingredients: string
}

function PlanTab({ week }: { week: string }) {
  const { dayOf, changeDay, upsertMeal, platform, toast, confirm } = useStore()
  const days = range(week, 7)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const today = todayKey()
  const goWeek = (w: string) => navigate('plan', { w }, true)

  const logAsMeal = async (date: string, p: Omit<PlanEntry, 'date'>) => {
    const mealId = newId('m')
    await upsertMeal(date, {
      id: mealId,
      slot: p.slot,
      items: [{ name: p.title, kcal: p.kcal ?? 0 }],
      memo: p.ingredients.length ? `献立より：${p.ingredients.join('、')}` : '献立より',
      createdAt: Date.now(),
    })
    await changeDay(date, (d) => {
      d.plans = d.plans.map((x) => (x.id === p.id ? { ...x, loggedMealId: mealId } : x))
      return d
    })
    toast('食事記録に追加しました。必要なら記録画面で PFC を追加してください')
  }

  const saveDraft = async () => {
    if (!draft || !draft.title.trim()) return
    const entry: Omit<PlanEntry, 'date'> = {
      id: draft.id ?? newId('p'),
      slot: draft.slot,
      title: draft.title.trim(),
      kcal: draft.kcal,
      ingredients: draft.ingredients
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    const d0 = draft
    setDraft(null)
    await changeDay(d0.date, (d) => {
      const i = d.plans.findIndex((x) => x.id === entry.id)
      if (i >= 0) d.plans[i] = { ...d.plans[i], ...entry }
      else d.plans.push(entry)
      return d
    })
  }

  const removeDraft = async () => {
    if (!draft?.id) return
    const d0 = draft
    setDraft(null)
    const ok = await confirm({ title: 'この献立を削除しますか？', okLabel: '削除する', danger: true })
    if (!ok) return
    await changeDay(d0.date, (d) => {
      d.plans = d.plans.filter((x) => x.id !== d0.id)
      return d
    })
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

      {platform?.sample && (
        <button className="card ai-card ai-cta" onClick={() => setAiOpen(true)}>
          <span className="ai-badge">
            <SparkIcon />
          </span>
          <span className="grow">
            <b>Claude に献立を考えてもらう</b>
            <small>目標カロリーに合わせた献立を作り、そのまま献立表に入れます</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      {days.map((d) => {
        const dayPlans = [...dayOf(d).plans].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
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
                      onClick={() => setDraft({ id: p.id, date: d, slot: p.slot, title: p.title, kcal: p.kcal, ingredients: p.ingredients.join('\n') })}
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
                      <button className="chip" onClick={() => logAsMeal(d, p)}>
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

      <Sheet open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? '献立を編集' : '献立を追加'}>
        {draft && (
          <div className="form">
            <p className="hint">{relativeDay(draft.date)}</p>
            <Segmented label="区分" value={draft.slot} onChange={(slot) => setDraft({ ...draft, slot })} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />
            <label className="field" htmlFor="plan-title">
              <span>料理名</span>
              <input id="plan-title" value={draft.title} placeholder="例：鮭の塩焼き定食" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="field">
              <span>カロリー（目安）</span>
              <NumInput label="カロリー" value={draft.kcal} placeholder="kcal" onChange={(kcal) => setDraft({ ...draft, kcal })} />
            </label>
            <label className="field" htmlFor="plan-ingredients">
              <span>食材（1行に1つ。「食材 分量」）</span>
              <textarea id="plan-ingredients" rows={4} value={draft.ingredients} placeholder={'鮭 1切れ\nほうれん草 1/2束'} onChange={(e) => setDraft({ ...draft, ingredients: e.target.value })} />
            </label>
            <button className="btn btn-primary block" disabled={!draft.title.trim()} onClick={saveDraft}>
              保存
            </button>
            {draft.id && (
              <button className="btn btn-ghost danger block" onClick={removeDraft}>
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
  const { targets, toast, platform, changeDay } = useStore()
  const tomorrow = addDays(todayKey(), 1)
  const [start, setStart] = useState(tomorrow)
  const [days, setDays] = useState('3')
  const [slots, setSlots] = useState<Slot[]>(['breakfast', 'lunch', 'dinner'])
  const [wishes, setWishes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Omit<PlanEntry, 'id'>[] | null>(null)
  const ctl = useRef<AbortController | null>(null)

  const toggle = (s: Slot) => setSlots((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : SLOTS.filter((x) => x === s || xs.includes(x))))

  const ask = async () => {
    const sample = platform?.sample
    if (!sample) return
    setBusy(true)
    setError('')
    setResult(null)
    ctl.current = new AbortController()
    try {
      const plans = await suggestPlans(sample, { startDate: start, days: Number(days), slots, targets, wishes: wishes.trim() || undefined }, ctl.current.signal)
      if (plans.length === 0) setError('献立を読み取れませんでした。もう一度試してください')
      else setResult(plans)
    } catch (e) {
      setError(sampleErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const accept = async () => {
    if (!result) return
    const byDate = new Map<string, Omit<PlanEntry, 'id'>[]>()
    for (const p of result) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p])
    for (const [date, ps] of byDate) {
      await changeDay(date, (d) => {
        d.plans.push(...ps.map(({ date: _d, ...rest }) => ({ ...rest, id: newId('p') })))
        return d
      })
    }
    toast(`${result.length}件の献立を追加しました`)
    setResult(null)
    onClose()
    navigate('plan', { w: weekStart(result[0].date) }, true)
  }

  const close = () => {
    ctl.current?.abort()
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title="Claude に献立を考えてもらう">
      {result ? (
        <div className="form">
          <p className="hint">この献立を献立表に追加しますか？（あとから編集・削除できます）</p>
          <ul className="plan-preview">
            {result.map((p, i) => (
              <li key={i}>
                <span className="plan-slot">
                  {formatDay(p.date)} {SLOT_LABEL[p.slot]}
                </span>
                <b>{p.title}</b>
                <small>
                  {p.kcal ? `${p.kcal} kcal · ` : ''}
                  {p.ingredients.join('、')}
                </small>
              </li>
            ))}
          </ul>
          <button className="btn btn-primary block" onClick={accept}>
            献立表に追加する
          </button>
          <button className="btn btn-outline block" onClick={() => setResult(null)}>
            条件を変えて考え直す
          </button>
        </div>
      ) : (
        <div className="form">
          <label className="field" htmlFor="ai-start">
            <span>開始日</span>
            <input id="ai-start" type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
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
          <label className="field" htmlFor="ai-wishes">
            <span>希望（任意）</span>
            <textarea id="ai-wishes" rows={2} value={wishes} placeholder="例：平日は15分以内、魚多め、予算控えめ" onChange={(e) => setWishes(e.target.value)} />
          </label>
          <p className="hint">
            1日の目標 {targets.kcal}kcal（P{targets.p} F{targets.f} C{targets.c}g）に合わせて考えます。
          </p>
          {busy ? (
            <Thinking label="献立を考えています…（1分ほどかかることがあります）" onStop={() => ctl.current?.abort()} />
          ) : (
            <button className="btn btn-claude block" disabled={slots.length === 0} onClick={ask}>
              <SparkIcon /> 献立を考えてもらう
            </button>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ---- 買い物リスト ----

function ShopTab() {
  const { lists, changeLists, dayOf, toast } = useStore()
  const items = [...lists.shopping].sort((a, b) => a.createdAt - b.createdAt)
  const [text, setText] = useState('')
  const [shareText, setShareText] = useState<string | null>(null)
  const todo = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)
  const setItems = (fn: (xs: ShoppingItem[]) => ShoppingItem[]) => changeLists((l) => ({ ...l, shopping: fn(l.shopping) }))

  const fromPlans = async () => {
    const today = todayKey()
    const plans = range(today, 7).flatMap((d) => dayOf(d).plans)
    const lines = aggregateIngredients(plans)
    if (lines.length === 0) {
      toast('これから7日間の献立に食材が登録されていません')
      return
    }
    const now = Date.now()
    // 前回献立から作った未購入の行は作り直す（手入力の行と購入済みは残す）
    await setItems((xs) => [
      ...xs.filter((i) => !(i.fromPlan && !i.done)),
      ...lines.map((name, i) => ({ id: newId('s'), name, done: false, fromPlan: true, createdAt: now + i })),
    ])
    toast(`${lines.length}品目をリストにしました`)
  }

  const add = async () => {
    const names = text
      .split(/[\n、,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!names.length) return
    const now = Date.now()
    setText('')
    await setItems((xs) => [...xs, ...names.map((name, i) => ({ id: newId('s'), name, done: false, fromPlan: false, createdAt: now + i }))])
  }

  const copyList = async () => {
    const body = `買い物リスト\n${todo.map((i) => `・${i.name}`).join('\n')}`
    try {
      await navigator.clipboard.writeText(body)
      toast('リストをコピーしました。LINE などに貼り付けて送れます')
    } catch {
      setShareText(body)
    }
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
        <input id="shop-add" value={text} placeholder="追加する（例：牛乳、卵）" aria-label="買う物" onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" disabled={!text.trim()}>
          追加
        </button>
      </form>

      <section className="card">
        <div className="section-head">
          <h2>買う物（{todo.length}）</h2>
          {todo.length > 0 && (
            <button className="chip" onClick={copyList}>
              コピー
            </button>
          )}
        </div>
        {todo.length === 0 ? (
          <p className="empty">リストは空です</p>
        ) : (
          <ul className="shop-list">
            {todo.map((i) => (
              <ShopRow key={i.id} item={i} setItems={setItems} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="card muted-card">
          <div className="section-head">
            <h2>購入済み（{done.length}）</h2>
            <button className="chip" onClick={() => setItems((xs) => xs.filter((i) => !i.done))}>
              まとめて消す
            </button>
          </div>
          <ul className="shop-list">
            {done.map((i) => (
              <ShopRow key={i.id} item={i} setItems={setItems} />
            ))}
          </ul>
        </section>
      )}

      <Sheet open={shareText !== null} onClose={() => setShareText(null)} title="買い物リスト">
        <p className="hint">長押しで選んでコピーしてください。</p>
        <textarea id="share-text" className="share-text" rows={8} readOnly value={shareText ?? ''} onFocus={(e) => e.target.select()} />
      </Sheet>
    </>
  )
}

function ShopRow({ item, setItems }: { item: ShoppingItem; setItems: (fn: (xs: ShoppingItem[]) => ShoppingItem[]) => Promise<void> }) {
  return (
    <li className={item.done ? 'shop-row done' : 'shop-row'}>
      <label>
        <input type="checkbox" checked={item.done} onChange={(e) => setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, done: e.target.checked } : x)))} />
        <span>{item.name}</span>
      </label>
      <button className="icon-btn small" aria-label={`${item.name}を削除`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== item.id))}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  )
}
