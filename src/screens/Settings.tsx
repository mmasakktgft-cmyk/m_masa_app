import { useRef, useState } from 'react'
import { useStore } from '../store'
import { exportAll, importAll, resetAll, type ExportData } from '../db'
import { REPORT_REASON_NAMES } from '../types'
import { PageHeader } from '../components/ui'

export default function SettingsScreen() {
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const activeReports = s.reports.filter((r) => r.active)

  const doExport = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const d = new Date()
    a.href = url
    a.download = `ap-trainer-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`
    a.click()
    URL.revokeObjectURL(url)
    await s.updateSettings({ lastExportAt: Date.now() })
    setMsg('エクスポートしました。ファイルを安全な場所に保存してください。')
  }

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ExportData
      if (!confirm(`回答 ${data.attempts?.length ?? 0} 件のデータで、今のデータを置き換えます。よろしいですか？`)) return
      await importAll(data)
      await s.reload()
      setMsg('インポートしました。')
    } catch (e) {
      setMsg(`インポートできませんでした：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const doReset = async () => {
    if (!confirm('すべての学習データを削除します。元に戻せません。よろしいですか？')) return
    await resetAll()
    await s.reload()
    setMsg('学習データを削除しました。')
  }

  return (
    <div className="page">
      <PageHeader title="設定" />
      {msg && <p className="notice static" role="status">{msg}</p>}

      <section className="card">
        <h2>演習</h2>
        <label className="switch">
          <span className="grow">回答前に出典（年度・問番号）を表示</span>
          <input type="checkbox" checked={s.settings.showSourceBeforeAnswer}
            onChange={(e) => s.updateSettings({ showSourceBeforeAnswer: e.target.checked })} />
        </label>
        <label className="switch">
          <span className="grow">動作確認用サンプル問題を含める</span>
          <input type="checkbox" checked={s.settings.includeSamples}
            onChange={(e) => s.updateSettings({ includeSamples: e.target.checked })} />
        </label>
        <label className="field">
          <span>1日の目標問題数</span>
          <input type="number" min={1} max={200} value={s.settings.dailyGoal}
            onChange={(e) => s.updateSettings({ dailyGoal: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label className="field">
          <span>受験予定日</span>
          <input type="date" value={s.settings.examDate}
            onChange={(e) => s.updateSettings({ examDate: e.target.value })} />
        </label>
      </section>

      <section className="card">
        <h2>学習データ</h2>
        <p className="muted small">
          学習データはこの端末のブラウザ内だけに保存されています。ブラウザのデータを消すと失われるため、定期的にエクスポートしてください。
          {s.settings.lastExportAt && <> 前回のエクスポート：{new Date(s.settings.lastExportAt).toLocaleString('ja-JP')}</>}
        </p>
        <div className="actions">
          <button className="btn primary" onClick={doExport}>エクスポート</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>インポート</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
      </section>

      <section className="card">
        <h2>不備を報告した問題</h2>
        {activeReports.length === 0 ? <p className="muted small">ありません。</p> : (
          <ul className="list">
            {activeReports.map((r) => {
              const q = s.questionMap.get(r.questionId)
              return (
                <li key={r.id} className="row">
                  <span className="grow">
                    {q ? (q.source.short ?? q.source.label) : r.questionId}
                    <span className="muted small block">{REPORT_REASON_NAMES[r.reason]}{r.comment && `：${r.comment}`}</span>
                  </span>
                  <button className="btn small-btn" onClick={() => s.withdrawReport(r.id!)}>取り消す</button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="muted small">報告内容はエクスポートファイルに含まれます。問題データの修正に使います。</p>
      </section>

      <section className="card">
        <h2>リセット</h2>
        <button className="btn danger" onClick={doReset}>すべての学習データを削除</button>
      </section>

      <p className="muted small pad">
        問題の出典：独立行政法人情報処理推進機構（IPA）が公表している情報処理技術者試験の過去問題。解説はこのアプリ独自のものです。
      </p>
    </div>
  )
}
