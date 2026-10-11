import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { navigate } from '../router'
import { selectNext } from '../logic/selector'
import { assetUrl } from '../data'
import { buildClaudePrompt } from '../logic/claudePrompt'
import { pct, rate } from '../logic/stats'
import type { Attempt, ChoiceLabel, Confidence, Karte, Question, QuizConfig, ReportReason } from '../types'
import { MASTERY_NAMES, REPORT_REASON_NAMES } from '../types'
import { KindBadge, MasteryDots, Sheet } from '../components/ui'

interface Props {
  config: QuizConfig
  active: boolean
}

type Phase = 'question' | 'result' | 'done' | 'empty'

export default function Quiz({ config, active }: Props) {
  const store = useStore()
  const [question, setQuestion] = useState<Question | null>(null)
  const [repeated, setRepeated] = useState(false)
  const [phase, setPhase] = useState<Phase>('question')
  const [choice, setChoice] = useState<ChoiceLabel | null>(null)
  const [confidence, setConfidence] = useState<Confidence | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([])
  const [showDetail, setShowDetail] = useState(false)
  const [sheet, setSheet] = useState<'claude' | 'report' | null>(null)
  const [newKarte, setNewKarte] = useState<Karte | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())
  const [zoom, setZoom] = useState<string | null>(null)

  const pickNext = () => {
    const sel = selectNext({
      questions: store.questions,
      attempts: store.attempts,
      mastery: store.mastery,
      config,
      blockedIds: store.blockedIds,
      now: Date.now(),
    })
    setChoice(null)
    setConfidence(null)
    setAttempt(null)
    setShowDetail(false)
    setNewKarte(null)
    if (!sel) {
      setQuestion(null)
      setPhase('empty')
      return
    }
    setQuestion(sel.question)
    setRepeated(sel.repeated)
    setPhase('question')
    startedAt.current = Date.now()
    setElapsed(0)
    window.scrollTo(0, 0)
  }

  // 画面が表示されたときに、まだ問題がなければ出題する
  useEffect(() => {
    if (active && !question && phase === 'question') pickNext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    if (!active || phase !== 'question') return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [active, phase])

  const submit = async (gaveUp: boolean) => {
    if (!question || (!gaveUp && !choice)) return
    const a: Omit<Attempt, 'id'> = {
      questionId: question.id,
      answeredAt: Date.now(),
      choice: gaveUp ? null : choice,
      gaveUp,
      isCorrect: !gaveUp && choice === question.answer,
      confidence: gaveUp ? null : confidence,
      timeSpentSec: Math.round((Date.now() - startedAt.current) / 1000),
      excluded: false,
    }
    setAttempt(a as Attempt)
    setSessionAttempts((s) => [...s, a as Attempt])
    setPhase('result')
    window.scrollTo(0, 0)
    const karte = await store.recordAttempt(a)
    if (karte) setNewKarte(karte)
  }

  const next = () => {
    if (config.count > 0 && sessionAttempts.length >= config.count) {
      setPhase('done')
      window.scrollTo(0, 0)
      return
    }
    pickNext()
  }

  const total = config.count > 0 ? config.count : null
  const index = sessionAttempts.length + (phase === 'question' ? 1 : 0)

  if (phase === 'empty') {
    return (
      <div className="page">
        <TopBar index={null} total={null} />
        <div className="card center">
          <p className="lead">出題できる問題がありません</p>
          <p className="muted">
            この条件の問題はすべて正解済みです。条件を変えるか、問題データの追加をお待ちください。
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => navigate('home')}>ホームへ</button>
          <button className="btn" onClick={() => navigate('setup')}>条件を変える</button>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const r = rate(sessionAttempts)
    return (
      <div className="page">
        <TopBar index={null} total={null} />
        <div className="card center">
          <p className="muted">おつかれさまでした</p>
          <p className="big">{r.correct} / {r.n} 問正解</p>
          <p className="lead">正答率 {pct(r.rate)}</p>
        </div>
        <ul className="list card">
          {sessionAttempts.map((a, i) => {
            const q = store.questionMap.get(a.questionId)
            return (
              <li key={i} className="row">
                <span className={a.isCorrect ? 'ok' : 'ng'}>{a.isCorrect ? '◯' : '✕'}</span>
                <span className="grow">{q?.source.label} {q?.number && `問${q.number}`}</span>
                <span className="muted small">{q?.topicIds.map(store.topicName).join('・')}</span>
              </li>
            )
          })}
        </ul>
        <div className="actions sticky">
          <button className="btn" onClick={() => navigate('analysis')}>傾向分析</button>
          <button className="btn primary" onClick={() => { setSessionAttempts([]); pickNext() }}>
            続けて演習する ▶
          </button>
        </div>
      </div>
    )
  }

  if (!question) return <div className="page loading">問題を選んでいます…</div>

  const showSource = store.settings.showSourceBeforeAnswer || phase === 'result'
  const answered = phase === 'result' && attempt

  return (
    <div className="page quiz">
      <TopBar index={index} total={total} elapsed={phase === 'question' ? elapsed : null} />
      <div className="meta">
        <KindBadge kind={question.kind} />
        {showSource && <span className="muted small">{question.source.label}{question.kind === 'past' && ` 問${question.number}`}</span>}
        {repeated && <span className="tag warn">再出題</span>}
      </div>

      {answered && (
        <div className={`verdict ${attempt.isCorrect ? 'ok' : 'ng'}`} role="status">
          <span className="verdict-mark">{attempt.isCorrect ? '◯ 正解' : '✕ 不正解'}</span>
          <span>
            {!attempt.isCorrect && <>あなた：{attempt.gaveUp ? 'わからない' : attempt.choice}　</>}
            正解：<b>{question.answer}</b>
          </span>
        </div>
      )}

      <section className="card stem">
        <p className="pre">{question.stem}</p>
        {question.figures?.map((f) => (
          <button key={f} className="figure" onClick={() => setZoom(f)} aria-label="図を拡大">
            <img src={assetUrl(f)} alt="問題の図" />
          </button>
        ))}
      </section>

      <div className="choices" role="radiogroup" aria-label="選択肢">
        {question.choices.map((c) => {
          const selected = choice === c.label
          let state = ''
          if (answered) {
            if (c.label === question.answer) state = 'correct'
            else if (c.label === attempt.choice) state = 'wrong'
          }
          return (
            <button
              key={c.label}
              role="radio"
              aria-checked={selected}
              className={`choice ${selected ? 'selected' : ''} ${state}`}
              disabled={phase !== 'question'}
              onClick={() => setChoice(c.label)}
            >
              <span className="choice-label">{c.label}</span>
              <span className="choice-text">
                {c.image ? <img src={assetUrl(c.image)} alt={`選択肢${c.label}の図`} /> : c.text}
              </span>
              {state === 'correct' && <span className="choice-mark">◯</span>}
              {state === 'wrong' && <span className="choice-mark">✕</span>}
              {!answered && selected && <span className="choice-mark">✓</span>}
            </button>
          )
        })}
      </div>

      {phase === 'question' && (
        <>
          <div className="confidence">
            <span className="muted small">自信度（任意）</span>
            <div className="segmented">
              {(
                [
                  ['sure', '自信あり'],
                  ['maybe', 'たぶん'],
                  ['guess', '勘'],
                ] as [Confidence, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  className={confidence === v ? 'on' : ''}
                  aria-pressed={confidence === v}
                  onClick={() => setConfidence(confidence === v ? null : v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="actions sticky">
            <button className="btn" onClick={() => submit(true)}>わからない</button>
            <button className="btn primary" disabled={!choice} onClick={() => submit(false)}>
              回答する ▶
            </button>
          </div>
        </>
      )}

      {answered && (
        <ResultBody
          question={question}
          attempt={attempt}
          showDetail={showDetail}
          onToggleDetail={() => setShowDetail((v) => !v)}
          newKarte={newKarte}
        />
      )}

      {answered && (
        <div className="actions sticky stacked">
          <div className="row-buttons">
            <button className="btn small-btn" onClick={() => setShowDetail((v) => !v)}>
              {showDetail ? '解説を閉じる' : '解説を見る'}
            </button>
            <button className="btn small-btn" onClick={() => setSheet('claude')}>Claudeに質問</button>
            <button className="btn small-btn" onClick={() => navigate('analysis')}>傾向分析</button>
          </div>
          <button className="btn primary" onClick={next}>
            {total && sessionAttempts.length >= total ? '結果を見る ▶' : '次の問題へ ▶'}
          </button>
        </div>
      )}

      {sheet === 'claude' && (
        <ClaudeSheet question={question} attempt={attempt} onClose={() => setSheet(null)} />
      )}
      {sheet === 'report' && (
        <ReportSheet
          onClose={() => setSheet(null)}
          onSubmit={async (reason, comment) => {
            await store.reportQuestion(question.id, reason, comment)
            setSheet(null)
            pickNext()
          }}
        />
      )}
      {answered && (
        <button className="link-btn report" onClick={() => setSheet('report')}>
          🚩 この問題の不備を報告
        </button>
      )}
      {zoom && (
        <div className="zoom" onClick={() => setZoom(null)} role="dialog" aria-label="図の拡大表示">
          <img src={assetUrl(zoom)} alt="問題の図（拡大）" />
        </div>
      )}
    </div>
  )
}

function TopBar({ index, total, elapsed }: { index: number | null; total: number | null; elapsed?: number | null }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={() => navigate('home')} aria-label="演習を中断してホームへ">✕</button>
      <span className="grow center">
        {index !== null && (total ? `${index} / ${total}` : `${index} 問目`)}
      </span>
      <span className="muted small timer">
        {elapsed != null && `⏱ ${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`}
      </span>
    </header>
  )
}

function ResultBody({
  question,
  attempt,
  showDetail,
  onToggleDetail,
  newKarte,
}: {
  question: Question
  attempt: Attempt
  showDetail: boolean
  onToggleDetail: () => void
  newKarte: Karte | null
}) {
  const store = useStore()
  const ex = question.explanation
  return (
    <div className="result">
      {newKarte && (
        <button className="notice" onClick={() => navigate('karte')}>
          📋 {newKarte.attemptCount}問に到達。学習カルテを更新しました ›
        </button>
      )}
      <section className="card">
        <h3>根拠</h3>
        <p className="pre">{ex.basis}</p>
      </section>
      <section className="card">
        <h3>各選択肢の要点</h3>
        <ul className="per-choice">
          {question.choices.map((c) => (
            <li key={c.label}>
              <span className={c.label === question.answer ? 'ok' : 'ng'}>
                {c.label} {c.label === question.answer ? '◯' : '✕'}
              </span>
              <span>{ex.perChoice[c.label]}</span>
            </li>
          ))}
        </ul>
      </section>
      {!attempt.isCorrect && (
        <section className="card caution">
          <h3>⚠ 間違えやすいポイント</h3>
          <p className="pre">{ex.pitfalls}</p>
        </section>
      )}
      {showDetail && (
        <section className="card detail">
          <h3>詳しい解説</h3>
          {attempt.isCorrect && <p className="pre">{ex.pitfalls}</p>}
          {ex.detail && <p className="pre">{ex.detail}</p>}
          {ex.altCalc && (
            <>
              <h4>別解・検算</h4>
              <p className="pre">{ex.altCalc}</p>
            </>
          )}
          {question.validityNote && (
            <>
              <h4>現行制度との違い</h4>
              <p className="pre">{question.validityNote}</p>
            </>
          )}
          <p className="muted small">
            分類：{question.categoryLarge} ＞ {question.categoryMiddle}
          </p>
          <button className="link-btn" onClick={onToggleDetail}>解説を閉じる</button>
        </section>
      )}
      <section className="card topics">
        {question.topicIds.map((t) => {
          const m = store.mastery.get(t)
          return (
            <div key={t} className="row">
              <span className="grow">論点：{store.topicName(t)}</span>
              <MasteryDots state={m?.state ?? 'unseen'} streak={m?.distinctCorrectStreak ?? 0} />
              <span className="small muted">{MASTERY_NAMES[m?.state ?? 'unseen']}</span>
            </div>
          )
        })}
        <p className="muted small">
          出典：{question.source.url ? <a href={question.source.url} target="_blank" rel="noreferrer">{question.source.label} ↗</a> : question.source.label}
        </p>
      </section>
    </div>
  )
}

function ClaudeSheet({ question, attempt, onClose }: { question: Question; attempt: Attempt | null; onClose: () => void }) {
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const prompt = buildClaudePrompt(question, attempt, text)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      setCopied(false)
      alert('コピーできませんでした。下の文面を長押しして手動でコピーしてください。')
    }
  }
  return (
    <Sheet title="💬 Claude に質問" onClose={onClose}>
      <label className="field">
        <span>聞きたいこと（任意）</span>
        <textarea
          rows={3}
          value={text}
          placeholder="例：ウがなぜ誤りなのか、もう少し詳しく教えて"
          onChange={(e) => { setText(e.target.value); setCopied(false) }}
        />
      </label>
      <details>
        <summary className="small muted">コピーされる文面を見る</summary>
        <pre className="prompt-preview">{prompt}</pre>
      </details>
      <div className="actions">
        <button className="btn primary" onClick={copy}>{copied ? '✓ コピーしました' : '文面をコピー'}</button>
        <a className="btn" href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude を開く ↗</a>
      </div>
      <p className="muted small">コピーしたら Claude アプリ（または claude.ai）に貼り付けて送信してください。</p>
    </Sheet>
  )
}

function ReportSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (r: ReportReason, c: string) => void }) {
  const [reason, setReason] = useState<ReportReason>('answer')
  const [comment, setComment] = useState('')
  return (
    <Sheet title="🚩 問題の不備を報告" onClose={onClose}>
      <p className="muted small">
        報告すると、この問題は出題を停止し、これまでの回答は採点から外します（設定画面から取り消せます）。
      </p>
      <div className="radio-list">
        {(Object.keys(REPORT_REASON_NAMES) as ReportReason[]).map((r) => (
          <label key={r} className="radio">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
            {REPORT_REASON_NAMES[r]}
          </label>
        ))}
      </div>
      <label className="field">
        <span>詳しい内容（任意）</span>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="actions">
        <button className="btn" onClick={onClose}>やめる</button>
        <button className="btn primary" onClick={() => onSubmit(reason, comment)}>報告して次へ</button>
      </div>
    </Sheet>
  )
}
