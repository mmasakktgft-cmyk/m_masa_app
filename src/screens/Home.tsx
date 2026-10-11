import { useStore } from '../store'
import { navigate } from '../router'
import { countOnDay, fieldStats, lastN, pct, rate, studyStreak, topicsByState, MIN_RELIABLE_N } from '../logic/stats'
import { sampleSetIds } from '../data'
import type { Field, QuizConfig } from '../types'
import { AUTO_CONFIG, FIELD_NAMES } from '../types'

const DAY = 24 * 60 * 60 * 1000

export default function Home({ onStart }: { onStart: (c: QuizConfig) => void }) {
  const s = useStore()
  const now = new Date()
  const today = countOnDay(s.attempts, now)
  const goal = s.settings.dailyGoal
  const streak = studyStreak(s.attempts, now)
  const daysLeft = Math.ceil((new Date(s.settings.examDate + 'T00:00:00').getTime() - now.getTime()) / DAY)
  const overall = rate(lastN(s.attempts, Infinity))
  const recent = rate(lastN(s.attempts, 50))
  const due = topicsByState(s.mastery, 'review_due')
  const fs = fieldStats(s.attempts.filter((a) => !a.excluded), s.questionMap)
  const weak = (Object.keys(fs) as Field[])
    .filter((f) => fs[f].n >= MIN_RELIABLE_N && (fs[f].rate ?? 1) < 0.6)
    .map((f) => FIELD_NAMES[f])
  const samples = sampleSetIds(s.bank)
  const onlySamples = s.bank.sets.every((x) => samples.has(x.id))
  const needExport =
    s.attempts.length >= 20 &&
    (s.settings.lastExportAt === null || Date.now() - s.settings.lastExportAt > 7 * DAY)
  const isFirst = s.attempts.length === 0

  const start = (c: QuizConfig) => {
    onStart(c)
    navigate('quiz')
  }

  return (
    <div className="page home">
      <header className="topbar">
        <h1 className="grow">AP 過去問トレーナー</h1>
        <button className="icon-btn" onClick={() => navigate('settings')} aria-label="設定">⚙</button>
      </header>

      {onlySamples && (
        <div className="notice static">
          🧪 現在は動作確認用のサンプル問題（オリジナル {s.questions.length} 問）だけが入っています。過去問データは順次追加されます。
        </div>
      )}

      <section className="card">
        <div className="row">
          <span className="grow">今日の目標</span>
          <span><b>{today}</b> / {goal} 問</span>
        </div>
        <progress value={Math.min(today, goal)} max={goal} aria-label="今日の目標の達成度" />
        <div className="row muted small">
          <span className="grow">連続学習 {streak} 日</span>
          {daysLeft >= 0 && <span>試験まであと <b>{daysLeft}</b> 日</span>}
        </div>
      </section>

      {due.length > 0 && (
        <section className="card">
          <div className="row">
            <h2 className="grow">📌 復習期限の論点 {due.length} 件</h2>
          </div>
          <ul className="bullets">
            {due.slice(0, 3).map((t) => <li key={t}>{s.topicName(t)}</li>)}
          </ul>
          {due.length > 3 && <button className="link-btn" onClick={() => navigate('topics')}>すべて見る ›</button>}
        </section>
      )}

      {isFirst ? (
        <section className="card">
          <p>まずは全分野からバランスよく出題して、いまの実力を把握します。</p>
          <p className="muted small">回答するたびに、苦手な論点や復習のタイミングに合わせて出題が変わっていきます。</p>
        </section>
      ) : (
        <section className="card">
          <div className="row">
            <span className="grow">全体正答率</span>
            <b>{pct(overall.rate)}</b>
            <span className="muted small">（直近50問 {pct(recent.rate)}）</span>
          </div>
          {weak.length > 0 && <p className="small">弱点：{weak.join('／')}</p>}
          <button className="link-btn" onClick={() => navigate('analysis')}>傾向分析を見る ›</button>
        </section>
      )}

      {needExport && (
        <button className="notice" onClick={() => navigate('settings')}>
          💾 学習データのバックアップ（エクスポート）をおすすめします ›
        </button>
      )}

      <div className="actions sticky stacked">
        <button className="btn primary big-btn" onClick={() => start(AUTO_CONFIG)}>▶ 演習をはじめる</button>
        <div className="row-buttons">
          <button className="btn small-btn" onClick={() => navigate('setup')}>分野・年度を指定</button>
          <button className="btn small-btn" onClick={() => navigate('topics')}>論点一覧</button>
        </div>
      </div>
    </div>
  )
}
