/**
 * 数値入力欄の文字列の扱い。
 * 日本語キーボードの全角数字・全角ピリオドを半角にし、数字と小数点以外は捨てる。
 */
export function normalizeNumText(raw: string, allowDecimal: boolean): string {
  const half = raw.replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/[。、,]/g, '.')
  const kept = half.replace(allowDecimal ? /[^\d.]/g : /\D/g, '')
  if (!allowDecimal) return kept
  // 小数点は最初の1つだけ残す
  const i = kept.indexOf('.')
  return i < 0 ? kept : kept.slice(0, i + 1) + kept.slice(i + 1).replace(/\./g, '')
}

/** 空欄や "." だけなら undefined。"72." は 72 として扱う */
export function parseNumText(text: string): number | undefined {
  if (text === '' || text === '.') return undefined
  const n = Number(text.endsWith('.') ? text.slice(0, -1) : text)
  return Number.isFinite(n) ? n : undefined
}

export function formatNum(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '' : String(value)
}
