import { useEffect, useState } from 'react'
import { NumInput, Segmented, SparkIcon, TopBar } from '../components/ui'
import { db, exportAll, importAll, resetAll, useLive } from '../db'
import { CLAUDE_NEW_URL } from '../logic/claude'
import { todayKey } from '../logic/date'
import { ACTIVITY_LEVELS, calcTargets, GOAL_LABEL, sumItems } from '../logic/nutrition'
import { navigate } from '../router'
import { useStore } from '../store'
import { DEFAULT_PROFILE, type Goal, type MyMenu, type Profile, type Sex } from '../types'

export default function SettingsScreen({ setup }: { setup: boolean }) {
  const { profile, updateProfile, toast } = useStore()
  const [p, setP] = useState<Profile>(profile ?? DEFAULT_PROFILE)
  const [manual, setManual] = useState(!!profile?.kcalOverride)
  useEffect(() => {
    if (profile) setP(profile)
  }, [profile])
  const t = calcTargets({ ...p, kcalOverride: manual ? p.kcalOverride : undefined })
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }))
  const menus = useLive(() => db.myMenus.orderBy('lastUsedAt').reverse().toArray(), [], [] as MyMenu[])

  const save = async () => {
    const next = { ...p, kcalOverride: manual ? p.kcalOverride : undefined }
    await updateProfile(next)
    // 今日の体重が未記録なら、入力した体重を記録にも入れておく
    if (!(await db.weights.get(todayKey()))) await db.weights.put({ date: todayKey(), kg: next.weightKg })
    toast('保存しました')
    if (setup) navigate('today', {}, true)
  }

  const doExport = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `meal-log-${todayKey()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const doImport = async (file: File | undefined) => {
    if (!file || !confirm('現在のデータをすべて置き換えます。よろしいですか？')) return
    try {
      await importAll(JSON.parse(await file.text()))
      toast('読み込みました')
      setTimeout(() => location.reload(), 600)
    } catch (e) {
      toast(e instanceof Error ? e.message : '読み込めませんでした')
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
              <NumInput label="年齢" value={p.age} onChange={(v) => set({ age: v ?? 0 })} />
            </label>
            <label className="field">
              <span>身長 cm</span>
              <NumInput label="身長" step={0.1} value={p.heightCm} onChange={(v) => set({ heightCm: v ?? 0 })} />
            </label>
            <label className="field">
              <span>体重 kg</span>
              <NumInput label="体重" step={0.1} value={p.weightKg} onChange={(v) => set({ weightKg: v ?? 0 })} />
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
        <label className="check">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          目標カロリーを自分で決める
        </label>
        {manual && (
          <label className="field">
            <span>目標カロリー kcal</span>
            <NumInput label="目標カロリー" value={p.kcalOverride} placeholder={String(t.tdee)} onChange={(v) => set({ kcalOverride: v })} />
          </label>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">水分</h2>
        <div className="grid2">
          <label className="field">
            <span>1日の目標 ml</span>
            <NumInput label="水分の目標" step={100} value={p.waterTargetMl} onChange={(v) => set({ waterTargetMl: v ?? 2000 })} />
          </label>
          <label className="field">
            <span>コップ1杯 ml</span>
            <NumInput label="コップ1杯" step={50} value={p.cupMl} onChange={(v) => set({ cupMl: v && v > 0 ? v : 200 })} />
          </label>
        </div>
      </section>

      <div className="sticky-save">
        <button className="btn btn-primary block" onClick={save} disabled={!p.age || !p.heightCm || !p.weightKg}>
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
                    <button
                      className="chip"
                      onClick={() => {
                        const name = prompt('メニュー名', m.name)
                        if (name?.trim()) db.myMenus.update(m.id!, { name: name.trim() })
                      }}
                    >
                      名前
                    </button>
                    <button className="chip danger" onClick={() => confirm(`「${m.name}」を削除しますか？`) && db.myMenus.delete(m.id!)}>
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
              <li>このアプリは AI の API を使わないため、利用料はかかりません。</li>
              <li>写真の推定・アドバイス・献立づくりは、あなたの Claude（claude.ai／Claude アプリ。無料プランでも可）で行います。</li>
              <li>アプリが指示文を作ってコピーし、Claude を開きます。回答の「コピー」を押して戻り、「貼り付けて取り込む」で反映されます。</li>
              <li>スマホでは写真の共有先から Claude アプリを選べます。PC では claude.ai に写真を添付してください。</li>
            </ul>
            <a className="btn btn-outline block" href={CLAUDE_NEW_URL} target="_blank" rel="noreferrer">
              claude.ai を開く
            </a>
          </section>

          <section className="card">
            <h2 className="card-title">データ</h2>
            <p className="hint">データはこの端末のブラウザ内だけに保存されます。機種変更の前にバックアップしてください（写真は含まれません）。</p>
            <div className="btn-col">
              <button className="btn btn-outline block" onClick={doExport}>
                バックアップを保存
              </button>
              <label className="btn btn-outline block">
                バックアップから復元
                <input type="file" accept="application/json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
              </label>
              <button
                className="btn btn-ghost danger block"
                onClick={async () => {
                  if (!confirm('すべての記録と設定を削除します。元に戻せません。よろしいですか？')) return
                  await resetAll()
                  location.reload()
                }}
              >
                すべてのデータを削除
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
