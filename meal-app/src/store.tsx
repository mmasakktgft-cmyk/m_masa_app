import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadProfile, saveProfile } from './db'
import { calcTargets, type Targets } from './logic/nutrition'
import type { Profile } from './types'
import { DEFAULT_PROFILE } from './types'

interface Store {
  /** 未設定（初回起動）なら null */
  profile: Profile | null
  ready: boolean
  targets: Targets
  updateProfile: (p: Profile) => Promise<void>
  toast: (message: string) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number>(undefined)

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p)
      setReady(true)
    })
  }, [])

  const updateProfile = useCallback(async (p: Profile) => {
    await saveProfile(p)
    setProfile(p)
  }, [])

  const toast = useCallback((m: string) => {
    setMessage(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2600)
  }, [])

  const value = useMemo<Store>(
    () => ({ profile, ready, targets: calcTargets(profile ?? DEFAULT_PROFILE), updateProfile, toast }),
    [profile, ready, updateProfile, toast],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast" role="status" aria-live="polite" data-show={message ? '' : undefined}>
        {message}
      </div>
    </Ctx.Provider>
  )
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider がありません')
  return s
}
