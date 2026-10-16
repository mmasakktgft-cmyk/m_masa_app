import { useEffect, useRef, useState } from 'react'
import { NumInput, ReplyImporter, Segmented, Sheet, SparkIcon, TopBar } from '../components/ui'
import { db, recentItems, touchMyMenu, useLive } from '../db'
import { canSharePhoto, copyText, openClaude, photoPrompt, sharePhotoToClaude, textEstimatePrompt } from '../logic/claude'
import { formatDay } from '../logic/date'
import { shrinkImage, useObjectUrl } from '../logic/image'
import { sumItems } from '../logic/nutrition'
import { goBack } from '../router'
import { useStore } from '../store'
import { SLOT_LABEL, SLOTS, type FoodItem, type Meal, type MyMenu, type Slot } from '../types'

const emptyItem = (): FoodItem => ({ name: '', kcal: 0 })

export default function MealEditor({ date, slot: initialSlot, id }: { date: string; slot: Slot; id?: number }) {
  const { toast } = useStore()
  const [loaded, setLoaded] = useState(id === undefined)
  const [slot, setSlot] = useState<Slot>(initialSlot)
  const [items, setItems] = useState<FoodItem[]>([])
  const [photo, setPhoto] = useState<Blob | undefined>()
  const [memo, setMemo] = useState('')
  const [estimated, setEstimated] = useState(false)
  const [saveMenu, setSaveMenu] = useState(false)
  const [picker, setPicker] = useState(false)
  const [describe, setDescribe] = useState('')
  const [sentToClaude, setSentToClaude] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const album = useRef<HTMLInputElement>(null)
  const photoUrl = useObjectUrl(photo)
  const back = () => goBack('today', { d: date })

  useEffect(() => {
    if (id === undefined) return
    db.meals.get(id).then((m) => {
      if (m) {
        setSlot(m.slot)
        setItems(m.items)
        setPhoto(m.photo)
        setMemo(m.memo ?? '')
        setEstimated(!!m.estimated)
      }
      setLoaded(true)
    })
  }, [id])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setPhoto(await shrinkImage(file))
    setSentToClaude(false)
  }

  const sendPhoto = async () => {
    if (!photo) return
    const prompt = photoPrompt(slot, memo || undefined)
    const r = await sharePhotoToClaude(photo, prompt)
    if (r === 'shared') {
      setSentToClaude(true)
      toast('送信先で Claude を選んでください。指示文はコピー済みです')
    } else if (r === 'unsupported') {
      // PC など共有できない環境：指示文をコピーして claude.ai を開き、写真は手動で添付してもらう
      await openClaude(prompt)
      setSentToClaude(true)
      toast('指示文をコピーしました。claude.ai で写真を添付して送信してください')
    }
  }

  const sendText = async () => {
    if (!describe.trim()) return
    await openClaude(textEstimatePrompt(describe.trim()))
    setSentToClaude(true)
    toast('指示文をコピーしました。Claude で送信してください')
  }

  const update = (i: number, patch: Partial<FoodItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const remove = (i: number) => setItems((xs) => xs.filter((_, j) => j !== i))

  const valid = items.filter((i) => i.name.trim())
  const total = sumItems(valid)
  const canSave = valid.length > 0 || !!photo

  const save = async () => {
    const meal: Meal = {
      date,
      slot,
      items: valid.map((i) => ({ ...i, name: i.name.trim() })),
      photo,
      memo: memo.trim() || undefined,
      estimated,
      createdAt: Date.now(),
    }
    if (id !== undefined) {
      const prev = await db.meals.get(id)
      await db.meals.put({ ...meal, id, createdAt: prev?.createdAt ?? meal.createdAt })
    } else {
      await db.meals.add(meal)
    }
    if (saveMenu && valid.length) {
      const name = valid.length === 1 ? valid[0].name : `${valid[0].name} ほか${valid.length - 1}品`
      await db.myMenus.add({ name, items: meal.items, useCount: 0, lastUsedAt: Date.now() })
    }
    toast(id !== undefined ? '更新しました' : '記録しました')
    back()
  }

  const del = async () => {
    if (id === undefined || !confirm('この記録を削除しますか？')) return
    await db.meals.delete(id)
    toast('削除しました')
    back()
  }

  if (!loaded) return null

  return (
    <div className="screen editor">
      <TopBar
        title={`${formatDay(date)}の記録`}
        back={{ fallback: 'today', params: { d: date } }}
        right={
          id !== undefined ? (
            <button className="text-btn danger" onClick={del}>
              削除
            </button>
          ) : undefined
        }
      />

      <Segmented label="食事の区分" value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />

      {/* 写真 */}
      <section className="card">
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={album} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {photoUrl ? (
          <div className="photo-preview">
            <img src={photoUrl} alt="食事の写真" />
            <div className="photo-actions">
              <button className="chip" onClick={() => camera.current?.click()}>
                撮り直す
              </button>
              <button className="chip" onClick={() => setPhoto(undefined)}>
                写真を外す
              </button>
            </div>
          </div>
        ) : (
          <div className="photo-pick">
            <button className="photo-btn" onClick={() => camera.current?.click()}>
              <span aria-hidden="true">📷</span>
              写真を撮る
            </button>
            <button className="photo-btn" onClick={() => album.current?.click()}>
              <span aria-hidden="true">🖼️</span>
              アルバムから
            </button>
          </div>
        )}
      </section>

      {/* Claude で推定 */}
      <section className="card ai-card">
        <div className="ai-head">
          <span className="ai-badge">
            <SparkIcon />
          </span>
          <div>
            <h2>Claude でカロリーを推定</h2>
            <p>{photo ? '写真を Claude に送り、返ってきた回答を貼り付けると品目が自動で入ります。' : '食べたものを書いて Claude に送ると、カロリーと PFC を推定します。'}</p>
          </div>
        </div>
        <ol className="steps">
          <li className={sentToClaude ? 'done' : ''}>
            <span className="step-no">1</span>
            {photo ? (
              <button className="btn btn-claude block" onClick={sendPhoto}>
                <SparkIcon /> {canSharePhoto() ? '写真を Claude アプリに送る' : '指示文をコピーして Claude を開く'}
              </button>
            ) : (
              <div className="describe">
                <textarea rows={2} value={describe} placeholder="例：牛丼並盛、味噌汁、サラダ" onChange={(e) => setDescribe(e.target.value)} />
                <button className="btn btn-claude block" disabled={!describe.trim()} onClick={sendText}>
                  <SparkIcon /> Claude で推定する
                </button>
              </div>
            )}
          </li>
          <li>
            <span className="step-no">2</span>
            <div className="grow">
              <p className="step-text">Claude の回答の「コピー」ボタンを押してから、ここに戻って取り込み</p>
              <ReplyImporter
                expect="items"
                onParsed={(r) => {
                  if (r.kind !== 'items') return
                  setItems((xs) => [...xs.filter((x) => x.name.trim()), ...r.items])
                  setEstimated(true)
                  toast(`${r.items.length}品を取り込みました。数値は目安なので必要に応じて直してください`)
                }}
              />
            </div>
          </li>
        </ol>
        {photo && (
          <button className="text-btn small" onClick={() => copyText(photoPrompt(slot, memo || undefined)).then(() => toast('指示文をコピーしました'))}>
            指示文だけコピー
          </button>
        )}
      </section>

      {/* 品目 */}
      <section className="card">
        <div className="section-head">
          <h2>品目</h2>
          <button className="chip chip-accent" onClick={() => setPicker(true)}>
            ⭐ Myメニュー・履歴から
          </button>
        </div>
        {items.length === 0 && <p className="hint">手入力するか、Claude の推定結果や Myメニューから追加してください。</p>}
        <ul className="item-edit-list">
          {items.map((it, i) => (
            <li key={i} className="item-edit">
              <div className="item-edit-row">
                <input className="grow" aria-label="品名" placeholder="品名（例：ごはん）" value={it.name} onChange={(e) => update(i, { name: e.target.value })} />
                <button className="icon-btn small" aria-label={`${it.name || '品目'}を削除`} onClick={() => remove(i)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="item-edit-grid">
                <label>
                  量
                  <input aria-label="量" placeholder="150g" value={it.amount ?? ''} onChange={(e) => update(i, { amount: e.target.value || undefined })} />
                </label>
                <label className="kcal">
                  kcal
                  <NumInput label="カロリー" value={it.kcal || undefined} placeholder="0" onChange={(v) => update(i, { kcal: v ?? 0 })} />
                </label>
                <label>
                  P
                  <NumInput label="たんぱく質 g" step={0.1} value={it.p} placeholder="g" onChange={(v) => update(i, { p: v })} />
                </label>
                <label>
                  F
                  <NumInput label="脂質 g" step={0.1} value={it.f} placeholder="g" onChange={(v) => update(i, { f: v })} />
                </label>
                <label>
                  C
                  <NumInput label="炭水化物 g" step={0.1} value={it.c} placeholder="g" onChange={(v) => update(i, { c: v })} />
                </label>
              </div>
            </li>
          ))}
        </ul>
        <button className="btn btn-outline block" onClick={() => setItems((xs) => [...xs, emptyItem()])}>
          ＋ 品目を手入力
        </button>
      </section>

      <section className="card">
        <label className="field">
          <span>メモ</span>
          <textarea rows={2} value={memo} placeholder="外食先、気づいたことなど" onChange={(e) => setMemo(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={saveMenu} onChange={(e) => setSaveMenu(e.target.checked)} />
          この組み合わせを Myメニューに登録する
        </label>
      </section>

      <div className="save-bar">
        <div className="save-total">
          <b>{total.kcal}</b> kcal
          <span>
            P{Math.round(total.p)} F{Math.round(total.f)} C{Math.round(total.c)}
          </span>
        </div>
        <button className="btn btn-primary" disabled={!canSave} onClick={save}>
          {id !== undefined ? '更新する' : '記録する'}
        </button>
      </div>

      <QuickPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(picked, menuId) => {
          setItems((xs) => [...xs.filter((x) => x.name.trim()), ...picked])
          if (menuId !== undefined) touchMyMenu(menuId)
          setPicker(false)
          toast(`${picked.length}品を追加しました`)
        }}
      />
    </div>
  )
}

function QuickPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (items: FoodItem[], menuId?: number) => void }) {
  const [tab, setTab] = useState<'menu' | 'recent'>('menu')
  const [q, setQ] = useState('')
  const menus = useLive(() => db.myMenus.orderBy('lastUsedAt').reverse().toArray(), [], [] as MyMenu[])
  const recent = useLive(() => recentItems(40), [], [] as FoodItem[])
  const match = (s: string) => !q.trim() || s.includes(q.trim())

  return (
    <Sheet open={open} onClose={onClose} title="Myメニュー・履歴から追加">
      <Segmented
        label="一覧の種類"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'menu', label: `Myメニュー（${menus.length}）` },
          { value: 'recent', label: '最近食べたもの' },
        ]}
      />
      <input className="search" type="search" placeholder="絞り込み" value={q} onChange={(e) => setQ(e.target.value)} />
      {tab === 'menu' ? (
        menus.length === 0 ? (
          <p className="empty">記録画面の「Myメニューに登録」で、よく食べる組み合わせを登録できます。</p>
        ) : (
          <ul className="pick-list">
            {menus
              .filter((m) => match(m.name) || m.items.some((i) => match(i.name)))
              .map((m) => (
                <li key={m.id}>
                  <button className="pick-row" onClick={() => onPick(m.items, m.id)}>
                    <span className="pick-main">
                      <b>{m.name}</b>
                      <small>{m.items.map((i) => i.name).join('、')}</small>
                    </span>
                    <span className="pick-kcal">{sumItems(m.items).kcal} kcal</span>
                  </button>
                </li>
              ))}
          </ul>
        )
      ) : recent.length === 0 ? (
        <p className="empty">記録すると、ここからワンタップで追加できます。</p>
      ) : (
        <ul className="pick-list">
          {recent
            .filter((i) => match(i.name))
            .map((i) => (
              <li key={i.name}>
                <button className="pick-row" onClick={() => onPick([i])}>
                  <span className="pick-main">
                    <b>{i.name}</b>
                    {i.amount && <small>{i.amount}</small>}
                  </span>
                  <span className="pick-kcal">{i.kcal} kcal</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </Sheet>
  )
}
