import { useEffect, type ReactNode } from 'react'
import type { MasteryState, QuestionKind } from '../types'
import { navigate, type Route } from '../router'

export function KindBadge({ kind }: { kind: QuestionKind }) {
  return kind === 'past' ? (
    <span className="badge past">📘 過去問</span>
  ) : (
    <span className="badge original">✏️ オリジナル</span>
  )
}

const DOTS: Record<MasteryState, number> = { unseen: 0, review_due: 1, learning: 2, mastered: 4 }

export function MasteryDots({ state, streak }: { state: MasteryState; streak: number }) {
  const filled = state === 'mastered' ? 4 : Math.min(3, Math.max(DOTS[state] - 1, 0) + streak)
  return (
    <span className={`dots ${state}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={i < filled ? 'on' : ''}>●</span>
      ))}
    </span>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PageHeader({ title, back = 'home' }: { title: string; back?: Route }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={() => navigate(back)} aria-label="戻る">‹</button>
      <h1 className="grow">{title}</h1>
    </header>
  )
}

/** 正答率の横棒。サンプル数が少なければ「参考値」を添える */
export function RateBar({ label, rate, n, minN }: { label: string; rate: number | null; n: number; minN: number }) {
  return (
    <div className="ratebar">
      <span className="ratebar-label">{label}</span>
      <span className="ratebar-track">
        {rate !== null && <span className="ratebar-fill" style={{ width: `${Math.round(rate * 100)}%` }} />}
      </span>
      <span className="ratebar-value">
        {rate === null ? '未出題' : `${Math.round(rate * 100)}%`}
        <span className="muted small"> n={n}</span>
        {rate !== null && n < minN && <span className="tag">参考値</span>}
      </span>
    </div>
  )
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 240
  const h = 48
  const step = w / (values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - v * h).toFixed(1)}`).join(' ')
  return (
    <svg className="sparkline" viewBox={`-4 -4 ${w + 8} ${h + 8}`} role="img" aria-label={`10問ごとの正答率の推移：${values.map((v) => Math.round(v * 100) + '%').join('、')}`}>
      <line x1="0" x2={w} y1={h * 0.4} y2={h * 0.4} className="spark-guide" />
      <polyline points={pts} className="spark-line" />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - v * h} r="3" className="spark-dot" />
      ))}
    </svg>
  )
}
