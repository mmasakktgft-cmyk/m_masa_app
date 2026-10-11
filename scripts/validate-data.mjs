// 問題データ（public/data）の整合性チェック。データを追加したら必ず実行する。
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('public')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const LABELS = ['ア', 'イ', 'ウ', 'エ']
const FIELDS = ['technology', 'management', 'strategy']
const errors = []
const err = (id, msg) => errors.push(`${id}: ${msg}`)

const index = read('data/index.json')
const topics = read(index.topicsFile)
const topicIds = new Set(topics.map((t) => t.id))
for (const t of topics) if (!FIELDS.includes(t.field)) err(t.id, `論点の分野が不正: ${t.field}`)

const seen = new Set()
let total = 0
for (const set of index.sets) {
  const qs = read(set.file)
  for (const q of qs) {
    total++
    const id = q.id ?? '(idなし)'
    if (seen.has(id)) err(id, 'ID が重複')
    seen.add(id)
    if (!id.startsWith(set.id + '-')) err(id, `ID がセット ${set.id} で始まっていない`)
    if (!['past', 'original'].includes(q.kind)) err(id, 'kind が不正')
    if (set.sample && q.kind === 'past') err(id, 'サンプルセットに過去問が入っている')
    if (!q.stem?.trim()) err(id, '問題文が空')
    if (q.choices?.length !== 4) err(id, '選択肢が4つでない')
    q.choices?.forEach((c, i) => {
      if (c.label !== LABELS[i]) err(id, `選択肢${i + 1}のラベルが ${LABELS[i]} でない`)
      if (!c.text?.trim() && !c.image) err(id, `選択肢${c.label}が空`)
    })
    if (!LABELS.includes(q.answer)) err(id, `正解が不正: ${q.answer}`)
    if (!FIELDS.includes(q.field)) err(id, `分野が不正: ${q.field}`)
    if (!q.topicIds?.length) err(id, '論点がない')
    q.topicIds?.forEach((t) => topicIds.has(t) || err(id, `未定義の論点: ${t}`))
    if (!(q.difficulty >= 1 && q.difficulty <= 5)) err(id, '難易度が1〜5でない')
    const ex = q.explanation ?? {}
    if (!ex.basis?.trim()) err(id, '根拠が空')
    for (const l of LABELS) if (!ex.perChoice?.[l]?.trim()) err(id, `選択肢${l}の要点が空`)
    if (!ex.pitfalls?.trim()) err(id, '間違えやすいポイントが空')
    if (!q.source?.label) err(id, '出典がない')
    if (!['verified', 'disputed', 'retired'].includes(q.verification?.status)) err(id, '検証ステータスが不正')
    if (q.verification?.status === 'verified' && !q.verification.checks?.length) err(id, '検証済みなのに検証記録がない')
    for (const f of [...(q.figures ?? []), ...(q.choices ?? []).map((c) => c.image).filter(Boolean)]) {
      if (!fs.existsSync(path.join(root, f))) err(id, `図のファイルがない: ${f}`)
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} 件のエラー`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}
console.log(`✓ ${index.sets.length} セット・${total} 問・論点 ${topics.length} 件：問題なし`)
