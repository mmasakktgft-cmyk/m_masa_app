import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../types'
import { claudeUrl, parseReply, photoPrompt, planPrompt } from './claude'
import { addDays, relativeDay, weekStart } from './date'
import { calcBmr, calcTargets, sumItems } from './nutrition'
import { formatNum, normalizeNumText, parseNumText } from './numText'
import { aggregateIngredients, splitIngredient } from './shopping'

describe('nutrition', () => {
  it('基礎代謝は Mifflin-St Jeor 式', () => {
    expect(calcBmr({ sex: 'male', age: 30, heightCm: 170, weightKg: 65 })).toBe(1568)
    expect(calcBmr({ sex: 'female', age: 30, heightCm: 160, weightKg: 50 })).toBe(1189)
  })

  it('目標カロリーは消費カロリー±目標、PFC の合計がおおむね一致する', () => {
    const p = { ...DEFAULT_PROFILE, sex: 'male' as const, age: 30, heightCm: 170, weightKg: 65, activity: 1.55 }
    const keep = calcTargets({ ...p, goal: 'keep' })
    const lose = calcTargets({ ...p, goal: 'lose' })
    expect(keep.tdee).toBe(2430)
    expect(keep.kcal).toBe(2430)
    expect(lose.kcal).toBe(2030)
    const fromPfc = keep.p * 4 + keep.f * 9 + keep.c * 4
    expect(Math.abs(fromPfc - keep.kcal)).toBeLessThan(10)
  })

  it('手動設定があればそれを優先し、下限は 1200kcal', () => {
    expect(calcTargets({ ...DEFAULT_PROFILE, kcalOverride: 1800 }).kcal).toBe(1800)
    expect(calcTargets({ ...DEFAULT_PROFILE, age: 90, weightKg: 30, heightCm: 130, activity: 1.2, goal: 'lose' }).kcal).toBe(1200)
  })

  it('合計は PFC 未入力を 0 として扱う', () => {
    expect(sumItems([{ name: 'a', kcal: 100, p: 1.25 }, { name: 'b', kcal: 50.4 }])).toEqual({ kcal: 150, p: 1.3, f: 0, c: 0 })
  })
})

describe('date', () => {
  it('月またぎ・週の始まり', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(weekStart('2026-10-18')).toBe('2026-10-12') // 日曜 → 前の月曜
    expect(weekStart('2026-10-12')).toBe('2026-10-12')
    expect(relativeDay('2026-10-15', '2026-10-16')).toBe('昨日')
  })
})

describe('Claude の回答の取り込み', () => {
  it('json コードブロックから品目を読む', () => {
    const text = `推定結果です。\n\n\`\`\`json\n{"items":[{"name":"ごはん","amount":"150g","kcal":234,"p":3.8,"f":0.5,"c":55.7},{"name":"味噌汁","kcal":"40kcal","p":"2.5g"}]}\n\`\`\`\n以上です。`
    const r = parseReply(text)
    expect(r).toEqual({
      kind: 'items',
      items: [
        { name: 'ごはん', amount: '150g', kcal: 234, p: 3.8, f: 0.5, c: 55.7 },
        { name: '味噌汁', kcal: 40, p: 2.5 },
      ],
    })
  })

  it('コードブロックが崩れていても、全角数字や配列直書きでも読む', () => {
    const r = parseReply('結果 [{"name":"納豆","kcal":"９０","protein":7.4}] です')
    expect(r).toEqual({ kind: 'items', items: [{ name: '納豆', kcal: 90, p: 7.4 }] })
  })

  it('献立を読み、日本語の区分も受け付ける', () => {
    const r = parseReply('```json\n{"plans":[{"date":"2026-10-17","slot":"夕食","title":"鮭の塩焼き","kcal":550,"ingredients":["鮭 1切れ",""]},{"date":"bad","slot":"lunch","title":"x"}]}\n```')
    expect(r).toEqual({
      kind: 'plans',
      plans: [{ date: '2026-10-17', slot: 'dinner', title: '鮭の塩焼き', kcal: 550, ingredients: ['鮭 1切れ'] }],
    })
  })

  it('JSON がなければ null', () => {
    expect(parseReply('こんにちは')).toBeNull()
    expect(parseReply('```json\n{"items":[{"name":"x"}]}\n```')).toBeNull()
  })

  it('プロンプトには取り込み用の形式が含まれる', () => {
    expect(photoPrompt('lunch')).toContain('"items"')
    const targets = calcTargets(DEFAULT_PROFILE)
    expect(planPrompt({ startDate: '2026-10-17', days: 3, slots: ['dinner'], targets })).toContain('"plans"')
  })

  it('長すぎるプロンプトは URL に載せない', () => {
    expect(claudeUrl('短い')).toMatch(/\?q=/)
    expect(claudeUrl('あ'.repeat(1000))).toBe('https://claude.ai/new')
  })
})

describe('買い物リスト', () => {
  it('食材名と分量を分ける', () => {
    expect(splitIngredient('鶏むね肉 200g')).toEqual({ name: '鶏むね肉', amount: '200g' })
    expect(splitIngredient('塩　少々')).toEqual({ name: '塩', amount: '少々' })
    expect(splitIngredient('醤油：大さじ1')).toEqual({ name: '醤油', amount: '大さじ1' })
    expect(splitIngredient('キャベツ')).toEqual({ name: 'キャベツ', amount: '' })
  })

  it('同じ食材はまとめる', () => {
    expect(
      aggregateIngredients([{ ingredients: ['鶏むね肉 200g', '塩 少々'] }, { ingredients: ['鶏むね肉 150g', 'キャベツ'] }]),
    ).toEqual(['鶏むね肉 200g＋150g', '塩 少々', 'キャベツ'])
  })
})

describe('数値入力欄', () => {
  it('全角数字・全角ピリオドを半角にし、数字以外は捨てる', () => {
    expect(normalizeNumText('７２．５', true)).toBe('72.5')
    expect(normalizeNumText('72.5.1', true)).toBe('72.51')
    expect(normalizeNumText('2,000ml', false)).toBe('2000')
    expect(normalizeNumText('1.5', false)).toBe('15')
  })

  it('空欄は undefined、入力途中の "72." は 72', () => {
    expect(parseNumText('')).toBeUndefined()
    expect(parseNumText('.')).toBeUndefined()
    expect(parseNumText('72.')).toBe(72)
    expect(parseNumText('072')).toBe(72)
    expect(formatNum(undefined)).toBe('')
    expect(formatNum(0)).toBe('0')
  })
})
