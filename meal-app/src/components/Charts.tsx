import { useMemo, useRef, useState } from 'react'

/** 目標に対する摂取カロリーのリング。超過したら警告色に変える */
export function CalorieRing({ eaten, target }: { eaten: number; target: number }) {
  const r = 52
  const len = 2 * Math.PI * r
  const ratio = target > 0 ? eaten / target : 0
  const over = ratio > 1
  const remain = target - eaten
  return (
    <div className="ring" role="img" aria-label={`摂取 ${eaten}kcal／目標 ${target}kcal`}>
      <svg viewBox="0 0 128 128" width="148" height="148">
        <circle cx="64" cy="64" r={r} className="ring-track" />
        <circle
          cx="64"
          cy="64"
          r={r}
          className={over ? 'ring-fill over' : 'ring-fill'}
          strokeDasharray={`${Math.min(ratio, 1) * len} ${len}`}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div className="ring-center">
        <span className="ring-caption">{over ? 'オーバー' : 'あと'}</span>
        <span className="ring-value">{Math.abs(remain).toLocaleString()}</span>
        <span className="ring-unit">kcal</span>
      </div>
    </div>
  )
}

/** P/F/C のような「目標に対する進み具合」のバー */
export function Meter({
  label,
  value,
  target,
  unit,
  tone,
}: {
  label: string
  value: number
  target: number
  unit: string
  tone: 'p' | 'f' | 'c' | 'water'
}) {
  const ratio = target > 0 ? value / target : 0
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-num">
          <b>{Math.round(value)}</b> / {target}
          {unit}
        </span>
      </div>
      <div className={`meter-track tone-${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(value)} aria-label={label}>
        <div className={ratio > 1.15 ? 'meter-fill over' : 'meter-fill'} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
    </div>
  )
}

export interface Point {
  date: string
  value: number
}

/** 体重の推移（1系列の折れ線）。タップ／ホバーで値を表示 */
export function LineChart({ points, unit, label }: { points: Point[]; unit: string; label: string }) {
  const W = 340
  const H = 180
  const pad = { l: 36, r: 12, t: 14, b: 24 }
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const geo = useMemo(() => {
    if (points.length === 0) return null
    const vals = points.map((p) => p.value)
    let min = Math.min(...vals)
    let max = Math.max(...vals)
    if (max - min < 2) {
      const mid = (max + min) / 2
      min = mid - 1
      max = mid + 1
    }
    const span = max - min
    min -= span * 0.1
    max += span * 0.1
    const t0 = new Date(points[0].date).getTime()
    const t1 = new Date(points[points.length - 1].date).getTime()
    const x = (d: string) => (t1 === t0 ? (pad.l + W - pad.r) / 2 : pad.l + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r))
    const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
    const ticks = [0, 0.5, 1].map((k) => min + (max - min) * k)
    return { x, y, ticks }
  }, [points, pad.l, pad.r, pad.t, pad.b])

  if (!geo) return <p className="empty">記録するとここにグラフが表示されます</p>

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${geo.x(p.date).toFixed(1)},${geo.y(p.value).toFixed(1)}`).join('')
  const fmtDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

  const onMove = (clientX: number) => {
    const el = wrap.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const sx = ((clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(geo.x(p.date) - sx)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setHover(best)
  }

  const hp = hover !== null ? points[hover] : null

  return (
    <div
      className="linechart"
      ref={wrap}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerDown={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}の推移`}>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={geo.y(t)} y2={geo.y(t)} className="grid" />
            <text x={pad.l - 6} y={geo.y(t) + 4} className="axis" textAnchor="end">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="axis">
          {fmtDate(points[0].date)}
        </text>
        <text x={W - pad.r} y={H - 6} className="axis" textAnchor="end">
          {fmtDate(points[points.length - 1].date)}
        </text>
        <path d={path} className="line" />
        {points.length <= 14 &&
          points.map((p) => <circle key={p.date} cx={geo.x(p.date)} cy={geo.y(p.value)} r="3" className="dot" />)}
        {hp && (
          <g>
            <line x1={geo.x(hp.date)} x2={geo.x(hp.date)} y1={pad.t} y2={H - pad.b} className="crosshair" />
            <circle cx={geo.x(hp.date)} cy={geo.y(hp.value)} r="5" className="dot active" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: `${(geo.x(hp.date) / W) * 100}%` }}>
          <span>{fmtDate(hp.date)}</span>
          <b>
            {hp.value.toFixed(1)}
            {unit}
          </b>
        </div>
      )}
    </div>
  )
}
