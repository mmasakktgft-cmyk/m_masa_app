const pad = (n: number) => String(n).padStart(2, '0')

/** ローカル日付を YYYY-MM-DD で返す */
export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayKey(): string {
  return toKey(new Date())
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

/** 10/16（木） */
export function formatDay(key: string): string {
  const d = fromKey(key)
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`
}

export function weekdayOf(key: string): string {
  return WEEK[fromKey(key).getDay()]
}

/** 今日・昨日・明日はことばで、それ以外は日付で */
export function relativeDay(key: string, today = todayKey()): string {
  if (key === today) return '今日'
  if (key === addDays(today, -1)) return '昨日'
  if (key === addDays(today, 1)) return '明日'
  return formatDay(key)
}

/** key を含む週の月曜日 */
export function weekStart(key: string): string {
  const d = fromKey(key)
  const diff = (d.getDay() + 6) % 7
  return addDays(key, -diff)
}

export function range(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i))
}
