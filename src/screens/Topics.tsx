import { useStore } from '../store'
import type { Field, MasteryState } from '../types'
import { FIELD_NAMES, MASTERY_NAMES } from '../types'
import { MasteryDots, PageHeader } from '../components/ui'

const ORDER: MasteryState[] = ['review_due', 'learning', 'unseen', 'mastered']

export default function Topics() {
  const s = useStore()
  const topics = [...s.topics.values()]
  const fmt = (t: number | null) => (t === null ? '—' : new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }))
  return (
    <div className="page">
      <PageHeader title="論点一覧" />
      {(Object.keys(FIELD_NAMES) as Field[]).map((f) => {
        const list = topics
          .filter((t) => t.field === f)
          .sort((a, b) =>
            ORDER.indexOf(s.mastery.get(a.id)?.state ?? 'unseen') - ORDER.indexOf(s.mastery.get(b.id)?.state ?? 'unseen'))
        if (list.length === 0) return null
        return (
          <section key={f} className="card">
            <h2>{FIELD_NAMES[f]}</h2>
            <ul className="list">
              {list.map((t) => {
                const m = s.mastery.get(t.id)
                const state = m?.state ?? 'unseen'
                return (
                  <li key={t.id} className="row">
                    <span className="grow">
                      {t.name}
                      <span className="muted small block">{t.category}</span>
                    </span>
                    <span className="right">
                      <MasteryDots state={state} streak={m?.distinctCorrectStreak ?? 0} />
                      <span className={`small state-${state} block`}>{MASTERY_NAMES[state]}</span>
                      {m && (
                        <span className="muted small block">
                          {m.correct}/{m.attempts} 正解{state !== 'mastered' && ` ・次回 ${fmt(m.nextReviewAt)}`}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
