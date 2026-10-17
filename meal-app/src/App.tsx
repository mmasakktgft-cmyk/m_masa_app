import { useEffect, type ReactNode } from 'react'
import { todayKey, weekStart } from './logic/date'
import { navigate, switchTab, useRoute, type RouteName } from './router'
import BodyScreen from './screens/BodyScreen'
import MealEditor from './screens/MealEditor'
import PlanScreen from './screens/PlanScreen'
import SettingsScreen from './screens/SettingsScreen'
import TodayScreen from './screens/TodayScreen'
import { StoreProvider, useStore } from './store'
import { SLOTS, type Slot } from './types'

/** 今の時刻から記録する食事の区分を推測する */
function slotByTime(d = new Date()): Slot {
  const h = d.getHours()
  if (h >= 4 && h < 10) return 'breakfast'
  if (h >= 10 && h < 15) return 'lunch'
  if (h >= 17 || h < 4) return 'dinner'
  return 'snack'
}

/** 初回の目標設定へは、1回の起動につき1度だけ案内する */
let setupShown = false

function Screens() {
  const { name, params } = useRoute()
  const { status, profile } = useStore()

  useEffect(() => {
    if (status === 'ready' && !profile && name === 'today' && !setupShown) {
      setupShown = true
      navigate('settings', { setup: 1 }, true)
    }
  }, [status, profile, name])

  if (status === 'loading') {
    return (
      <main className="main center-screen">
        <p className="hint">記録を読み込んでいます…</p>
      </main>
    )
  }
  if (status === 'unavailable') {
    return (
      <main className="main center-screen">
        <div className="card unavailable">
          <h1>ごはん記録</h1>
          <p>このアプリは claude.ai にログインした状態で開くと使えます。記録はあなたの claude.ai の領域に保存されます。</p>
          <p className="hint">Claude アプリ、または claude.ai をブラウザで開き、このページのリンクを開き直してください。</p>
        </div>
      </main>
    )
  }

  const date = params.d ?? params.date ?? todayKey()
  let screen: ReactNode
  switch (name) {
    case 'meal': {
      const slot = SLOTS.includes(params.slot as Slot) ? (params.slot as Slot) : slotByTime()
      screen = <MealEditor key={`${date}-${slot}-${params.id ?? 'new'}`} date={date} slot={slot} id={params.id} />
      break
    }
    case 'plan':
      screen = <PlanScreen tab={params.tab === 'shop' ? 'shop' : 'plan'} week={params.w ?? weekStart(todayKey())} />
      break
    case 'body':
      screen = <BodyScreen />
      break
    case 'settings':
      screen = <SettingsScreen key={params.setup ?? 'settings'} setup={params.setup === '1'} />
      break
    default:
      screen = <TodayScreen date={date} />
  }

  return (
    <>
      <main className={name === 'meal' ? 'main no-nav' : 'main'}>{screen}</main>
      {name !== 'meal' && <TabBar current={name} date={name === 'today' ? date : todayKey()} />}
    </>
  )
}

const TABS: { name: RouteName; label: string; icon: ReactNode }[] = [
  {
    name: 'today',
    label: 'きょう',
    icon: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z" />,
  },
  {
    name: 'plan',
    label: '献立',
    icon: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="2.5" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </>
    ),
  },
  {
    name: 'body',
    label: '体重',
    icon: <path d="M4 18l5-6 4 3 7-9M15 6h5v5" />,
  },
  {
    name: 'settings',
    label: '設定',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" />
      </>
    ),
  },
]

function TabBar({ current, date }: { current: RouteName; date: string }) {
  const tab = (t: (typeof TABS)[number]) => (
    <button key={t.name} className={current === t.name ? 'tab on' : 'tab'} aria-current={current === t.name ? 'page' : undefined} onClick={() => switchTab(t.name)}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {t.icon}
      </svg>
      <span>{t.label}</span>
    </button>
  )
  return (
    <nav className="tabbar" aria-label="メイン">
      {TABS.slice(0, 2).map(tab)}
      <button className="fab" aria-label="食事を記録" onClick={() => navigate('meal', { date, slot: slotByTime() })}>
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        <span>記録</span>
      </button>
      {TABS.slice(2).map(tab)}
    </nav>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Screens />
    </StoreProvider>
  )
}
