import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../types'
import { makeBackup, readBackup } from './backup'
import { photoPrompt, planPrompt, readEstimate, readPlans } from './claude'
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

describe('Claude の回答の読み取り', () => {
  it('品目と note を読む（"40kcal" のような表記も数値にする）', () => {
    const r = readEstimate({
      items: [
        { name: 'ごはん', amount: '150g', kcal: 234, p: 3.8, f: 0.5, c: 55.7 },
        { name: '味噌汁', kcal: '40kcal', p: '2.5g' },
        { name: '', kcal: 10 },
      ],
      note: '茶碗1杯と仮定',
    })
    expect(r).toEqual({
      items: [
        { name: 'ごはん', amount: '150g', kcal: 234, p: 3.8, f: 0.5, c: 55.7 },
        { name: '味噌汁', kcal: 40, p: 2.5 },
      ],
      note: '茶碗1杯と仮定',
    })
  })

  it('配列だけ・全角数字・別名のキーも受け付ける', () => {
    expect(readEstimate([{ name: '納豆', kcal: '９０', protein: 7.4 }])).toEqual({ items: [{ name: '納豆', kcal: 90, p: 7.4 }] })
  })

  it('食べ物がなければ空', () => {
    expect(readEstimate({ items: [], note: '食べ物が写っていません' })).toEqual({ items: [], note: '食べ物が写っていません' })
    expect(readEstimate(null)).toEqual({ items: [] })
  })

  it('献立を読み、日本語の区分も受け付ける', () => {
    expect(
      readPlans({
        plans: [
          { date: '2026-10-17', slot: '夕食', title: '鮭の塩焼き', kcal: 550, ingredients: ['鮭 1切れ', ''] },
          { date: 'bad', slot: 'lunch', title: 'x' },
        ],
      }),
    ).toEqual([{ date: '2026-10-17', slot: 'dinner', title: '鮭の塩焼き', kcal: 550, ingredients: ['鮭 1切れ'] }])
  })

  it('プロンプトには返してほしい JSON の形が含まれる', () => {
    expect(photoPrompt('lunch')).toContain('"items"')
    const targets = calcTargets(DEFAULT_PROFILE)
    expect(planPrompt({ startDate: '2026-10-17', days: 3, slots: ['dinner'], targets })).toContain('"plans"')
  })
})

describe('バックアップ', () => {
  it('GitHub 版のバックアップを日ごとの記録にまとめる', () => {
    const r = readBackup({
      app: 'meal-log',
      version: 1,
      meals: [
        { id: 1, date: '2026-10-16', slot: 'lunch', items: [{ name: 'ごはん', kcal: 234 }], createdAt: 1 },
        { id: 2, date: '2026-10-16', slot: 'dinner', items: [{ name: '鮭', kcal: 200 }], createdAt: 2 },
      ],
      weights: [{ date: '2026-10-16', kg: 68 }],
      water: [{ date: '2026-10-15', ml: 600 }],
      myMenus: [{ id: 3, name: '朝の定番', items: [{ name: 'パン', kcal: 150 }], useCount: 2, lastUsedAt: 5 }],
      plans: [{ id: 4, date: '2026-10-17', slot: 'dinner', title: '親子丼', ingredients: ['卵 2個'] }],
      shopping: [{ id: 5, name: '牛乳', done: false, fromPlan: false, createdAt: 9 }],
      profile: null,
    })
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17'])
    const d16 = r.days[1]
    expect(d16.meals.map((m) => m.id)).toEqual(['v1m1', 'v1m2'])
    expect(d16.weight).toEqual({ kg: 68 })
    expect(r.days[0].waterMl).toBe(600)
    expect(r.days[2].plans[0]).toMatchObject({ id: 'v1p4', title: '親子丼', slot: 'dinner' })
    expect(r.lists.menus[0]).toMatchObject({ id: 'v1mm3', name: '朝の定番' })
    expect(r.lists.shopping[0]).toMatchObject({ id: 'v1s5', name: '牛乳' })
  })

  it('このアプリのバックアップは書き出した形のまま戻る', () => {
    const day = { date: '2026-10-16', meals: [], plans: [], waterMl: 400 }
    const b = makeBackup(null, { '2026-10-16': day }, { menus: [], shopping: [] })
    expect(readBackup(JSON.parse(JSON.stringify(b))).days).toEqual([day])
  })

  it('別のアプリのファイルは断る', () => {
    expect(() => readBackup({ app: 'camp-note', version: 1 })).toThrow()
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
