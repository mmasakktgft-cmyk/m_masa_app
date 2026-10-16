import type { PlanEntry } from '../types'

/** "鶏むね肉 200g" → { name: "鶏むね肉", amount: "200g" } */
export function splitIngredient(text: string): { name: string; amount: string } {
  const t = text.trim().replace(/　/g, ' ')
  const m = t.match(/^(.+?)[\s:：]+([\d０-９/.½¼]+.*|少々|適量|適宜|ひとつまみ|お好みで|大さじ.*|小さじ.*)$/)
  if (m) return { name: m[1].trim(), amount: m[2].trim() }
  return { name: t, amount: '' }
}

/**
 * 献立の食材を買い物リスト用にまとめる。
 * 同じ食材は1行にして分量を「＋」でつなぐ（単位がまちまちなので足し算はしない）。
 */
export function aggregateIngredients(plans: Pick<PlanEntry, 'ingredients'>[]): string[] {
  const map = new Map<string, string[]>()
  for (const p of plans) {
    for (const ing of p.ingredients) {
      const { name, amount } = splitIngredient(ing)
      if (!name) continue
      const list = map.get(name) ?? []
      if (amount) list.push(amount)
      map.set(name, list)
    }
  }
  return [...map.entries()].map(([name, amounts]) => (amounts.length ? `${name} ${amounts.join('＋')}` : name))
}
