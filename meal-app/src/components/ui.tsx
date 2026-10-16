import { useEffect, useRef, useState, type ReactNode } from 'react'
import { parseReply, readClipboard, type ParsedReply } from '../logic/claude'
import { formatNum, normalizeNumText, parseNumText } from '../logic/numText'
import { goBack, type RouteName } from '../router'

export function TopBar({
  title,
  back,
  right,
}: {
  title: ReactNode
  back?: { fallback: RouteName; params?: Record<string, string | number | undefined> }
  right?: ReactNode
}) {
  return (
    <header className="topbar">
      {back ? (
        <button className="icon-btn" aria-label="戻る" onClick={() => goBack(back.fallback, back.params)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span className="topbar-spacer" />
      )}
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-right">{right ?? <span className="topbar-spacer" />}</div>
    </header>
  )
}

/** 画面下からせり上がるシート。スマホで片手でも届く位置に操作をまとめる */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="閉じる" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Claude のマーク代わりのアイコン（ブランドロゴは使わない） */
export function SparkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"
        fill="currentColor"
      />
    </svg>
  )
}

/**
 * Claude の回答を貼り付けて取り込む欄。
 * 「クリップボードから貼り付け」ボタンで、コピーした回答をそのまま読み込める。
 */
export function ReplyImporter({ expect, onParsed }: { expect: ParsedReply['kind']; onParsed: (r: ParsedReply) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const tryParse = (t: string) => {
    const r = parseReply(t)
    if (!r) {
      setError('取り込める JSON が見つかりませんでした。Claude の回答全体（最後のコードブロックを含む）をコピーしてください。')
      return
    }
    if (r.kind !== expect) {
      setError(expect === 'items' ? '献立のデータです。献立画面で取り込んでください。' : '食事記録のデータです。記録画面で取り込んでください。')
      return
    }
    setError(null)
    setText('')
    onParsed(r)
  }

  const fromClipboard = async () => {
    const t = await readClipboard()
    if (t === null) {
      setError('クリップボードを読めませんでした。下の欄に長押しで貼り付けてください。')
      return
    }
    setText(t)
    tryParse(t)
  }

  return (
    <div className="importer">
      <button className="btn btn-tonal block" onClick={fromClipboard}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M9 4h6v3H9zM7 5H5v15h14V5h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        回答を貼り付けて取り込む
      </button>
      <details className="importer-manual">
        <summary>うまくいかないときは手で貼り付け</summary>
        <textarea rows={4} value={text} placeholder="Claude の回答をここに貼り付け" onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-outline block" disabled={!text.trim()} onClick={() => tryParse(text)}>
          取り込む
        </button>
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * 数値の入力欄。入力中の文字列は欄の中で持ち、親には数値（空欄なら undefined）だけを渡す。
 * 親が値を補っても入力中の表示は書き換えない（消したはずの数字が残る、"072" になる、を防ぐ）。
 * type="number" は全角数字を受け付けず、"72." の途中で値が消える端末もあるため、文字入力＋数字キーボードにしている。
 */
export function NumInput({
  value,
  onChange,
  step = 1,
  placeholder,
  label,
  className,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  step?: number
  placeholder?: string
  label: string
  className?: string
}) {
  const allowDecimal = step < 1
  const [text, setText] = useState(() => formatNum(value))
  /** この欄の入力が親の値を変えた直後かどうか */
  const fromInput = useRef(false)

  // 日付の切り替えや取り込みなど、外から値が変わったときだけ表示を合わせる
  useEffect(() => {
    if (fromInput.current) return
    if (parseNumText(text) !== value) setText(formatNum(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  useEffect(() => {
    fromInput.current = false
  })

  return (
    <input
      className={className}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const next = normalizeNumText(e.target.value, allowDecimal)
        setText(next)
        fromInput.current = true
        onChange(parseNumText(next))
      }}
    />
  )
}
