import { useState } from 'react'
import { StoreProvider } from './store'
import { useRoute } from './router'
import { AUTO_CONFIG, type QuizConfig } from './types'
import Home from './screens/Home'
import Setup from './screens/Setup'
import Quiz from './screens/Quiz'
import Analysis from './screens/Analysis'
import KarteScreen from './screens/Karte'
import Topics from './screens/Topics'
import SettingsScreen from './screens/Settings'

export default function App() {
  const route = useRoute()
  const [config, setConfig] = useState<QuizConfig>(AUTO_CONFIG)
  // 演習セッションを作り直すためのキー（「はじめる」ごとに増やす）
  const [sessionKey, setSessionKey] = useState(0)
  const start = (c: QuizConfig) => {
    setConfig(c)
    setSessionKey((k) => k + 1)
  }

  return (
    <StoreProvider>
      {route === 'home' && <Home onStart={start} />}
      {route === 'setup' && <Setup initial={config} onStart={start} />}
      {/* 傾向分析などを見に行っても演習の途中状態を保つため、演習画面は隠して残す */}
      <div hidden={route !== 'quiz'}>
        <Quiz key={sessionKey} config={config} active={route === 'quiz'} />
      </div>
      {route === 'analysis' && <Analysis />}
      {route === 'karte' && <KarteScreen />}
      {route === 'topics' && <Topics />}
      {route === 'settings' && <SettingsScreen />}
    </StoreProvider>
  )
}
