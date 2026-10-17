import { useMemo, useRef, useState } from 'react'
import { NumInput, Segmented, Sheet, SparkIcon, Thinking, TopBar } from '../components/ui'
import { estimateFromPhoto, estimateFromText, type Estimate } from '../logic/claude'
import { formatDay } from '../logic/date'
import { shrinkImage, useObjectUrl } from '../logic/image'
import { sumItems } from '../logic/nutrition'
import { photoUrl, sampleErrorText } from '../platform'
import { goBack } from '../router'
import { useStore } from '../store'
import { newId, SLOT_LABEL, SLOTS, type FoodItem, type Meal, type MyMenu, type Slot } from '../types'

const emptyItem = (): FoodItem => ({ name: '', kcal: 0 })

export default function MealEditor({ date, slot: initialSlot, id }: { date: string; slot: Slot; id?: string }) {
  const { platform, dayOf, upsertMeal, deleteMeal, changeLists, uploadPhoto, deletePhoto, toast, confirm } = useStore()
  // 開いた時点の記録を下書きの元にする（保存までは画面の中だけで編集する）
  const original = useMemo(() => (id ? dayOf(date).meals.find((m) => m.id === id) : undefined), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [slot, setSlot] = useState<Slot>(original?.slot ?? initialSlot)
  const [items, setItems] = useState<FoodItem[]>(original?.items ?? [])
  /** 新しく選んだ写真（保存時に写真置き場へ送る） */
  const [photo, setPhoto] = useState<Blob | undefined>()
  /** 保存済みの写真 */
  const [photoId, setPhotoId] = useState<string | undefined>(original?.photoId)
  const [memo, setMemo] = useState(original?.memo ?? '')
  const [estimated, setEstimated] = useState(!!original?.estimated)
  const [saveMenu, setSaveMenu] = useState(false)
  const [picker, setPicker] = useState(false)
  const [describe, setDescribe] = useState('')
  const [busy, setBusy] = useState<'photo' | 'text' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const album = useRef<HTMLInputElement>(null)
  const localUrl = useObjectUrl(photo)
  const shownPhoto = localUrl ?? (photoId ? photoUrl(photoId) : undefined)
  const sample = platform?.sample ?? null
  const canPhoto = !!sample && !!platform?.canSendImages
  const back = () => goBack('today', { d: date })

  const applyEstimate = (r: Estimate) => {
    setNote(r.note ?? '')
    if (r.items.length === 0) {
      setError(r.note ? '' : '食べ物を見つけられませんでした。写真を変えるか、文章で推定してください')
      return
    }
    setItems((xs) => [...xs.filter((x) => x.name.trim()), ...r.items])
    setEstimated(true)
    toast(`${r.items.length}品を推定しました。数値は目安なので必要なら直してください`)
  }

  const runEstimate = async (kind: 'photo' | 'text', blob?: Blob) => {
    if (!sample) return
    setError('')
    setNote('')
    setBusy(kind)
    ctl.current = new AbortController()
    try {
      if (kind === 'photo') {
        let b = blob ?? photo
        if (!b && photoId) b = await (await fetch(photoUrl(photoId))).blob()
        if (!b) return
        applyEstimate(await estimateFromPhoto(sample, b, slot, memo.trim() || undefined, ctl.current.signal))
      } else {
        applyEstimate(await estimateFromText(sample, describe.trim(), ctl.current.signal))
      }
    } catch (e) {
      setError(sampleErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const small = await shrinkImage(file)
    setPhoto(small)
    // 写真を選んだら、そのまま推定する（ボタンを押す手間を省く）
    if (canPhoto) runEstimate('photo', small)
  }

  const update = (i: number, patch: Partial<FoodItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const remove = (i: number) => setItems((xs) => xs.filter((_, j) => j !== i))

  const valid = items.filter((i) => i.name.trim())
  const total = sumItems(valid)
  const canSave = (valid.length > 0 || !!photo || !!photoId) && !busy && !saving

  const save = async () => {
    setSaving(true)
    try {
      let nextPhotoId = photoId
      if (photo) nextPhotoId = (await uploadPhoto(photo)) ?? undefined
      const meal: Meal = {
        id: original?.id ?? newId('m'),
        slot,
        items: valid.map((i) => ({ ...i, name: i.name.trim() })),
        photoId: nextPhotoId,
        memo: memo.trim() || undefined,
        estimated,
        createdAt: original?.createdAt ?? Date.now(),
      }
      await upsertMeal(date, meal)
      // 差し替えた・外した古い写真は消す
      if (original?.photoId && original.photoId !== nextPhotoId) deletePhoto(original.photoId)
      if (saveMenu && meal.items.length) {
        const name = meal.items.length === 1 ? meal.items[0].name : `${meal.items[0].name} ほか${meal.items.length - 1}品`
        await changeLists((l) => ({ ...l, menus: [...l.menus, { id: newId('mm'), name, items: meal.items, useCount: 0, lastUsedAt: Date.now() }] }))
      }
      toast(original ? '更新しました' : '記録しました')
      back()
    } catch {
      setSaving(false)
    }
  }

  const del = async () => {
    if (!original) return
    const ok = await confirm({ title: 'この記録を削除しますか？', message: '写真も一緒に削除されます。', okLabel: '削除する', danger: true })
    if (!ok) return
    await deleteMeal(date, original.id)
    if (original.photoId) deletePhoto(original.photoId)
    toast('削除しました')
    back()
  }

  return (
    <div className="screen editor">
      <TopBar
        title={`${formatDay(date)}の記録`}
        back={{ fallback: 'today', params: { d: date } }}
        right={
          original ? (
            <button className="text-btn danger" onClick={del}>
              削除
            </button>
          ) : undefined
        }
      />

      <Segmented label="食事の区分" value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />

      {/* 写真 → そのまま Claude が推定 */}
      <section className="card">
        <input id="photo-camera" ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <input id="photo-album" ref={album} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {shownPhoto ? (
          <div className="photo-preview">
            <img src={shownPhoto} alt="食事の写真" />
            <div className="photo-actions">
              <button className="chip" onClick={() => camera.current?.click()} disabled={!!busy}>
                撮り直す
              </button>
              <button
                className="chip"
                disabled={!!busy}
                onClick={() => {
                  setPhoto(undefined)
                  setPhotoId(undefined)
                }}
              >
                写真を外す
              </button>
              {canPhoto && !busy && (
                <button className="chip chip-claude" onClick={() => runEstimate('photo')}>
                  <SparkIcon size={14} /> もう一度推定
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
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
            {canPhoto && (
              <p className="hint center">
                <SparkIcon size={13} /> 写真を選ぶと、Claude がカロリーと PFC を自動で推定します
              </p>
            )}
          </>
        )}
        {busy === 'photo' && <Thinking label="Claude が写真から推定しています…" onStop={() => ctl.current?.abort()} />}
      </section>

      {/* 文章で推定 */}
      {sample && (
        <section className="card">
          <label className="field" htmlFor="describe">
            <span>
              <SparkIcon size={13} /> 文章で推定（写真がないとき・外食など）
            </span>
          </label>
          <div className="describe-row">
            <textarea id="describe" rows={2} value={describe} placeholder="例：牛丼並盛、味噌汁、サラダ" onChange={(e) => setDescribe(e.target.value)} />
            <button className="btn btn-claude" disabled={!describe.trim() || !!busy} onClick={() => runEstimate('text')}>
              推定
            </button>
          </div>
          {busy === 'text' && <Thinking label="Claude が推定しています…" onStop={() => ctl.current?.abort()} />}
        </section>
      )}

      {(note || error) && (
        <section className={error ? 'card error-card' : 'card note-card'} role={error ? 'alert' : 'status'}>
          {error && <p>{error}</p>}
          {note && (
            <p>
              <b>Claude のメモ：</b>
              {note}
            </p>
          )}
        </section>
      )}

      {/* 品目 */}
      <section className="card">
        <div className="section-head">
          <h2>品目</h2>
          <button className="chip chip-accent" onClick={() => setPicker(true)}>
            ⭐ Myメニュー・履歴から
          </button>
        </div>
        {items.length === 0 && <p className="hint">写真か文章で推定するか、手入力・Myメニューから追加してください。</p>}
        <ul className="item-edit-list">
          {items.map((it, i) => (
            <li key={i} className="item-edit">
              <div className="item-edit-row">
                <input id={`item-name-${i}`} className="grow" aria-label="品名" placeholder="品名（例：ごはん）" value={it.name} onChange={(e) => update(i, { name: e.target.value })} />
                <button className="icon-btn small" aria-label={`${it.name || '品目'}を削除`} onClick={() => remove(i)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="item-edit-grid">
                <label>
                  量
                  <input id={`item-amount-${i}`} aria-label="量" placeholder="150g" value={it.amount ?? ''} onChange={(e) => update(i, { amount: e.target.value || undefined })} />
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
        <label className="field" htmlFor="memo">
          <span>メモ（写真の推定にも使われます）</span>
          <textarea id="memo" rows={2} value={memo} placeholder="外食先、ごはん少なめ、など" onChange={(e) => setMemo(e.target.value)} />
        </label>
        <label className="check">
          <input id="save-menu" type="checkbox" checked={saveMenu} onChange={(e) => setSaveMenu(e.target.checked)} />
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
          {saving ? '保存中…' : original ? '更新する' : '記録する'}
        </button>
      </div>

      <QuickPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(picked, menuId) => {
          setItems((xs) => [...xs.filter((x) => x.name.trim()), ...picked])
          if (menuId) {
            changeLists((l) => ({
              ...l,
              menus: l.menus.map((m) => (m.id === menuId ? { ...m, useCount: m.useCount + 1, lastUsedAt: Date.now() } : m)),
            }))
          }
          setPicker(false)
          toast(`${picked.length}品を追加しました`)
        }}
      />
    </div>
  )
}

function QuickPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (items: FoodItem[], menuId?: string) => void }) {
  const { lists, days } = useStore()
  const [tab, setTab] = useState<'menu' | 'recent'>('menu')
  const [q, setQ] = useState('')
  const menus: MyMenu[] = [...lists.menus].sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  // 最近食べたもの（同じ名前は新しいものだけ）
  const recent = useMemo(() => {
    const meals = Object.values(days)
      .flatMap((d) => d.meals)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 80)
    const seen = new Set<string>()
    const out: FoodItem[] = []
    for (const m of meals)
      for (const it of m.items) {
        if (seen.has(it.name)) continue
        seen.add(it.name)
        out.push(it)
      }
    return out.slice(0, 40)
  }, [days])
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
      <input id="picker-search" className="search" type="search" placeholder="絞り込み" value={q} onChange={(e) => setQ(e.target.value)} />
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
