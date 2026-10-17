import { useEffect, useState } from 'react'
import { NumInput, Segmented, Sheet, SparkIcon, TopBar } from '../components/ui'
import { makeBackup, readBackup } from '../logic/backup'
import { todayKey } from '../logic/date'
import { ACTIVITY_LEVELS, calcTargets, GOAL_LABEL, sumItems } from '../logic/nutrition'
import { switchTab } from '../router'
import { useStore } from '../store'
import { DEFAULT_PROFILE, type Goal, type MyMenu, type Profile, type Sex } from '../types'

type NumKey = 'age' | 'heightCm' | 'weightKg' | 'waterTargetMl' | 'cupMl'
/** 入力途中は数値欄が空のことがあるので、数値の項目は省略可にしたフォーム用の型 */
type Form = Omit<Profile, NumKey> & Partial<Pick<Profile, NumKey>>

const REQUIRED: { key: NumKey; label: string }[] = [
  { key: 'age', label: '年齢' },
  { key: 'heightCm', label: '身長' },
  { key: 'weightKg', label: '体重' },
  { key: 'waterTargetMl', label: '水分の目標' },
  { key: 'cupMl', label: 'コップ1杯' },
]

/** 必須の数値がすべて正の値なら Profile にする */
function toProfile(f: Form, manual: boolean): Profile | null {
  if (REQUIRED.some(({ key }) => !(f[key]! > 0))) return null
  return { ...(f as Profile), kcalOverride: manual && f.kcalOverride ? f.kcalOverride : undefined }
}

export default function SettingsScreen({ setup }: { setup: boolean }) {
  const { profile, updateProfile, toast, confirm, lists, changeLists, days, dayOf, changeDay, platform, resetAll, historyLoaded, whenHistoryLoaded } = useStore()
  const [renaming, setRenaming] = useState<MyMenu | null>(null)
  const [busy, setBusy] = useState('')
  const [p, setP] = useState<Form>(profile ?? DEFAULT_PROFILE)
  const [manual, setManual] = useState(!!profile?.kcalOverride)
  useEffect(() => {
    if (profile) setP(profile)
  }, [profile])
  const complete = toProfile(p, manual)
  const missing = REQUIRED.filter(({ key }) => !(p[key]! > 0)).map((r) => r.label)
  // 目標カロリーの計算に要るのは年齢・身長・体重だけ（水分の欄が空でも表示する）
  const bodyReady = p.age! > 0 && p.heightCm! > 0 && p.weightKg! > 0
  const t = bodyReady ? calcTargets({ ...DEFAULT_PROFILE, ...p, kcalOverride: manual ? p.kcalOverride : undefined } as Profile) : null
  const set = (patch: Partial<Form>) => setP((x) => ({ ...x, ...patch }))
  const menus = [...lists.menus].sort((a, b) => b.lastUsedAt - a.lastUsedAt)

  const save = async () => {
    const next = toProfile(p, manual)
    if (!next) return
    await updateProfile(next)
    // 今日の体重が未記録なら、入力した体重を記録にも入れておく
    if (!dayOf(todayKey()).weight)
      await changeDay(todayKey(), (d) => {
        d.weight = { kg: next.weightKg }
        return d
      })
    toast('保存しました')
    if (setup) switchTab('today')
  }

  const doExport = async () => {
    const dl = platform?.downloads
    if (!dl) {
      toast('この画面ではファイルを保存できません')
      return
    }
    // 起動直後は直近の記録しか手元にないので、全期間を読み終えてから書き出す
    let all = days
    if (!historyLoaded) {
      setBusy('過去の記録を読み込み中…')
      try {
        all = await whenHistoryLoaded()
      } catch {
        toast('過去の記録を読み込めませんでした。ページを開き直してください')
        return
      } finally {
        setBusy('')
      }
    }
    try {
      await dl.save({ filename: `meal-log-${todayKey()}.json`, data: JSON.stringify(makeBackup(profile, all, lists)) })
    } catch (e) {
      if ((e as { code?: string })?.code !== 'cancelled') toast('保存できませんでした')
    }
  }

  const doImport = async (file: File | undefined) => {
    if (!file) return
    let data: ReturnType<typeof readBackup>
    try {
      data = readBackup(JSON.parse(await file.text()))
    } catch (e) {
      toast(e instanceof Error && !(e instanceof SyntaxError) ? e.message : 'ファイルを読み込めませんでした')
      return
    }
    const ok = await confirm({
      title: 'バックアップを取り込みますか？',
      message: `${data.days.length}日分の記録を取り込みます。同じ日付の記録は、バックアップの内容で置き換えます。`,
      okLabel: '取り込む',
    })
    if (!ok) return
    setBusy('取り込み中…')
    try {
      for (const d of data.days) await changeDay(d.date, () => d)
      await changeLists((l) => ({
        menus: [...l.menus, ...data.lists.menus.filter((m) => !l.menus.some((x) => x.id === m.id))],
        shopping: [...l.shopping, ...data.lists.shopping.filter((m) => !l.shopping.some((x) => x.id === m.id))],
      }))
      if (data.profile && !profile) await updateProfile({ ...DEFAULT_PROFILE, ...data.profile })
      toast(`${data.days.length}日分の記録を取り込みました`)
    } catch {
      // 保存の失敗は store が知らせる
    } finally {
      setBusy('')
    }
  }

  const doReset = async () => {
    const ok = await confirm({ title: 'すべてのデータを削除しますか？', message: '記録・設定・Myメニュー・買い物リストを削除します。元に戻せません。', okLabel: 'すべて削除する', danger: true })
    if (!ok) return
    setBusy('削除中…')
    try {
      await resetAll()
      toast('すべてのデータを削除しました')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="screen">
      <TopBar title={setup ? 'はじめの設定' : '設定'} />

      <section className="card">
        <h2 className="card-title">からだの情報</h2>
        <div className="form">
          <div className="field">
            <span>性別（基礎代謝の計算に使います）</span>
            <Segmented<Sex>
              label="性別"
              value={p.sex}
              onChange={(sex) => set({ sex })}
              options={[
                { value: 'female', label: '女性' },
                { value: 'male', label: '男性' },
              ]}
            />
          </div>
          <div className="grid3">
            <label className="field">
              <span>年齢</span>
              <NumInput label="年齢" value={p.age} onChange={(v) => set({ age: v })} />
            </label>
            <label className="field">
              <span>身長 cm</span>
              <NumInput label="身長" step={0.1} value={p.heightCm} onChange={(v) => set({ heightCm: v })} />
            </label>
            <label className="field">
              <span>体重 kg</span>
              <NumInput label="体重" step={0.1} value={p.weightKg} onChange={(v) => set({ weightKg: v })} />
            </label>
          </div>
          <div className="field">
            <span>ふだんの活動量</span>
            <div className="radio-list">
              {ACTIVITY_LEVELS.map((a) => (
                <label key={a.value} className={p.activity === a.value ? 'radio on' : 'radio'}>
                  <input type="radio" name="activity" checked={p.activity === a.value} onChange={() => set({ activity: a.value })} />
                  <span>
                    <b>{a.label}</b>
                    <small>{a.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <span>目標</span>
            <Segmented<Goal>
              label="目標"
              value={p.goal}
              onChange={(goal) => set({ goal })}
              options={(['lose', 'keep', 'gain'] as Goal[]).map((g) => ({ value: g, label: GOAL_LABEL[g] }))}
            />
          </div>
        </div>
      </section>

      <section className="card target-card">
        <h2 className="card-title">1日の目標</h2>
        {t ? (
          <>
            <div className="target-big">
              <b>{t.kcal.toLocaleString()}</b> kcal
            </div>
            <div className="target-pfc">
              <span className="pfc p">P {t.p}g</span>
              <span className="pfc f">F {t.f}g</span>
              <span className="pfc c">C {t.c}g</span>
            </div>
            <p className="hint">
              基礎代謝 {t.bmr}kcal × 活動量 {p.activity} ＝ 消費 {t.tdee}kcal
              {p.goal === 'lose' ? ' − 400kcal（減量）' : p.goal === 'gain' ? ' ＋ 300kcal（増量）' : ''}
              。目安なので、体重の変化を見ながら調整してください。
            </p>
          </>
        ) : (
          <p className="hint">年齢・身長・体重を入れると計算します。</p>
        )}
        <label className="check">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          目標カロリーを自分で決める
        </label>
        {manual && (
          <label className="field">
            <span>目標カロリー kcal</span>
            <NumInput label="目標カロリー" value={p.kcalOverride} placeholder={t ? String(t.tdee) : ''} onChange={(v) => set({ kcalOverride: v })} />
          </label>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">水分</h2>
        <div className="grid2">
          <label className="field">
            <span>1日の目標 ml</span>
            <NumInput label="水分の目標" step={100} value={p.waterTargetMl} onChange={(v) => set({ waterTargetMl: v })} />
          </label>
          <label className="field">
            <span>コップ1杯 ml</span>
            <NumInput label="コップ1杯" step={50} value={p.cupMl} onChange={(v) => set({ cupMl: v })} />
          </label>
        </div>
      </section>

      <div className="sticky-save">
        {missing.length > 0 && <p className="save-missing">{missing.join('・')}を入力してください</p>}
        <button className="btn btn-primary block" onClick={save} disabled={!complete}>
          {setup ? '保存してはじめる' : '保存する'}
        </button>
      </div>

      {!setup && (
        <>
          <section className="card">
            <h2 className="card-title">Myメニュー（{menus.length}）</h2>
            {menus.length === 0 ? (
              <p className="hint">記録画面で「Myメニューに登録」にチェックすると、ここに追加されます。</p>
            ) : (
              <ul className="menu-manage">
                {menus.map((m) => (
                  <li key={m.id}>
                    <span className="grow">
                      <b>{m.name}</b>
                      <small>
                        {sumItems(m.items).kcal}kcal · {m.useCount}回使用
                      </small>
                    </span>
                    <button className="chip" onClick={() => setRenaming(m)}>
                      名前
                    </button>
                    <button
                      className="chip danger"
                      onClick={async () => {
                        if (await confirm({ title: `「${m.name}」を削除しますか？`, okLabel: '削除する', danger: true }))
                          changeLists((l) => ({ ...l, menus: l.menus.filter((x) => x.id !== m.id) }))
                      }}
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">
              <SparkIcon /> Claude 連携について
            </h2>
            <ul className="about-list">
              <li>写真の推定・アドバイス・献立づくりは、あなたの Claude の利用枠を使います。追加料金はかかりません。</li>
              <li>初めて使うときに、Claude の利用を許可するか確認されます。</li>
              <li>利用枠の上限に達したときは、しばらくしてから試すか、手入力で記録してください。</li>
              <li>推定値は目安です。「推定」のついた記録は、必要に応じて数値を直してください。</li>
            </ul>
            <p className={platform?.sample && platform.canSendImages ? 'status ok' : 'status ng'}>
              {!platform?.sample
                ? '状態：この画面では Claude を使えません（claude.ai で開いてください）'
                : platform.canSendImages
                  ? '状態：使えます（写真からの推定にも対応）'
                  : '状態：文章からの推定は使えます。写真は送れません'}
            </p>
            {platform?.permissions && (
              <button className="btn btn-outline block" onClick={() => platform.permissions?.manage().catch(() => toast('画面右上のメニューの「権限」から設定してください'))}>
                Claude の利用の許可を確認する
              </button>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">データ</h2>
            <p className="hint">記録は claude.ai 上のあなた専用の領域に保存され、他の人からは見えません。スマホでも PC でも同じ記録を使えます。</p>
            <div className="btn-col">
              <button className="btn btn-outline block" onClick={doExport} disabled={!!busy}>
                バックアップを保存（写真は含みません）
              </button>
              <label className="btn btn-outline block">
                バックアップから取り込む
                <input id="import-file" type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
              </label>
              <p className="hint">GitHub 版（端末に保存する版）のバックアップも取り込めます。</p>
              <button className="btn btn-ghost danger block" onClick={doReset} disabled={!!busy}>
                すべてのデータを削除
              </button>
              {busy && <p className="hint">{busy}</p>}
            </div>
          </section>
        </>
      )}

      <Sheet open={renaming !== null} onClose={() => setRenaming(null)} title="メニュー名を変える">
        {renaming && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault()
              const name = (new FormData(e.currentTarget).get('menu-name') as string).trim()
              if (name) changeLists((l) => ({ ...l, menus: l.menus.map((x) => (x.id === renaming.id ? { ...x, name } : x)) }))
              setRenaming(null)
            }}
          >
            <input id="menu-name" name="menu-name" defaultValue={renaming.name} aria-label="メニュー名" />
            <button className="btn btn-primary block">保存</button>
          </form>
        )}
      </Sheet>
    </div>
  )
}
