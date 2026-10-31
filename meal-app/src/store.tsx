import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Sheet } from './components/ui'
import { addDays, todayKey } from './logic/date'
import { calcTargets, type Targets } from './logic/nutrition'
import { imagesAvailable, connectPlatform, type DbError, type DbQuerySnapshot, type DocRef, type Platform } from './platform'
import type { Day, Lists, Meal, Profile } from './types'
import { DEFAULT_PROFILE, emptyDay } from './types'

/**
 * 保存先（claude.ai のアプリ用データベース。自分の領域なので他の人からは見えない）
 *   data/users/<自分>/app            { profile }
 *   data/users/<自分>/app/days/<日付> Day（食事・水分・体重・献立）
 *   data/users/<自分>/lists          Lists（Myメニュー・買い物リスト）
 *
 * 起動を速くするため、日ごとの記録は直近の分だけ先に読んで画面を出し、
 * 全期間の分はそのあと裏で読み込む（historyLoaded で分かる）。
 */

/** 起動時に先に読む日数（これより前の記録は、画面を出したあとに読む） */
const RECENT_DAYS = 60

export type Status = 'loading' | 'ready' | 'unavailable'

interface ConfirmOptions {
  title: string
  message?: string
  okLabel: string
  danger?: boolean
}

interface Store {
  status: Status
  platform: Platform | null
  /** 未設定（初回起動）なら null */
  profile: Profile | null
  targets: Targets
  days: Record<string, Day>
  /** 全期間の記録を読み終えたか（false の間は直近の分だけ） */
  historyLoaded: boolean
  /** 全期間の記録を読み終えるのを待ち、その時点の全記録を返す（読めなかったら失敗する） */
  whenHistoryLoaded: () => Promise<Record<string, Day>>
  lists: Lists
  dayOf: (date: string) => Day
  updateProfile: (p: Profile) => Promise<void>
  /** その日の記録を書き換えて保存する（空になったら削除） */
  changeDay: (date: string, fn: (d: Day) => Day) => Promise<void>
  upsertMeal: (date: string, meal: Meal) => Promise<void>
  deleteMeal: (date: string, mealId: string) => Promise<void>
  addWater: (date: string, deltaMl: number) => Promise<void>
  changeLists: (fn: (l: Lists) => Lists) => Promise<void>
  uploadPhoto: (blob: Blob) => Promise<string | null>
  deletePhoto: (id: string) => Promise<void>
  /** 記録・設定・リストをすべて削除する（写真も消す） */
  resetAll: () => Promise<void>
  toast: (message: string) => void
  confirm: (o: ConfirmOptions) => Promise<boolean>
}

const Ctx = createContext<Store | null>(null)

const EMPTY_LISTS: Lists = { menus: [], shopping: [] }

/** undefined を落として JSON にできる形にする */
const plain = <T,>(v: T): Record<string, unknown> => JSON.parse(JSON.stringify(v))

const isEmptyDay = (d: Day) => d.meals.length === 0 && d.plans.length === 0 && !d.waterMl && !d.weight

function writeErrorText(e: unknown): string {
  const code = (e as DbError)?.code
  if (code === 'quota_exceeded') return '保存できる件数の上限に達しました。古い記録を整理してください'
  if (code === 'invalid_argument') return '保存できませんでした（このページを編集できる権限がない可能性があります）'
  return '保存できませんでした。通信状態を確認して、もう一度試してください'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [days, setDays] = useState<Record<string, Day>>({})
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const history = useRef(
    (() => {
      let resolve!: () => void
      let reject!: (e: unknown) => void
      const promise = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      promise.catch(() => {})
      return { promise, resolve, reject }
    })(),
  )
  const [lists, setLists] = useState<Lists>(EMPTY_LISTS)
  const [message, setMessage] = useState<string | null>(null)
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const timer = useRef<number>(undefined)

  // 連続操作でも最新の状態から書けるよう、手元の状態はここにも持つ
  const daysRef = useRef(days)
  const listsRef = useRef(lists)
  const refs = useRef<{ app: DocRef; lists: DocRef; day: (date: string) => DocRef } | null>(null)
  /** 同じ文書への書き込みは1つずつ（前の書き込みが終わってから次へ） */
  const queues = useRef(new Map<string, Promise<void>>())
  /** 書き込み待ちの件数（文書ごと）。待ちがある文書は、届いた最新状態より手元の状態を優先する */
  const pending = useRef(new Map<string, number>())
  const isPending = (path: string) => (pending.current.get(path) ?? 0) > 0

  const toast = useCallback((m: string) => {
    setMessage(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2800)
  }, [])

  useEffect(() => {
    let unsubs: (() => void)[] = []
    let cancelled = false
    const t0 = performance.now()
    const mark = (label: string) => console.info(`[ごはん記録] ${label}: ${Math.round(performance.now() - t0)}ms`)
    connectPlatform().then((p) => {
      if (cancelled) return
      mark('claude.ai に接続')
      setPlatform(p)
      if (!p.db || !p.uid) {
        setStatus('unavailable')
        return
      }
      // 写真を送れるかは表示に関係ないので、読み込みを待たせずに調べて後から反映する
      imagesAvailable(p.sample).then((ok) => {
        if (!cancelled && ok) setPlatform((cur) => (cur ? { ...cur, canSendImages: true } : cur))
      })
      const base = `data/users/${p.uid}`
      const app = p.db.doc(`${base}/app`)
      const listsDoc = p.db.doc(`${base}/lists`)
      const daysCol = app.collection('days')
      refs.current = { app, lists: listsDoc, day: (date) => daysCol.doc(date) }

      let pending = 3
      const loaded = () => {
        pending -= 1
        if (pending === 0) {
          setStatus('ready')
          mark('画面を表示')
        }
      }
      const once = () => {
        let done = false
        return () => {
          if (!done) {
            done = true
            loaded()
          }
        }
      }
      const onErr = (first: () => void) => (e: DbError) => {
        console.error(e)
        first()
        if (e.code !== 'revoked') toast('記録を読み込めませんでした。ページを開き直してください')
      }

      const f1 = once()
      unsubs.push(
        app.onSnapshot((s) => {
          const prof = (s.data()?.profile as Profile | undefined) ?? null
          setProfile(prof ? { ...DEFAULT_PROFILE, ...prof } : null)
          f1()
        }, onErr(f1)),
      )
      const f2 = once()
      unsubs.push(
        listsDoc.onSnapshot((s) => {
          if (isPending(listsDoc.path)) return f2()
          const d = s.data() as Partial<Lists> | undefined
          const next = { menus: d?.menus ?? [], shopping: d?.shopping ?? [] }
          listsRef.current = next
          setLists(next)
          f2()
        }, onErr(f2)),
      )

      /** 届いた日ごとの記録で手元を置き換える（書き込み待ちの日は手元を優先） */
      const applyDays = (snap: DbQuerySnapshot) => {
        const next: Record<string, Day> = {}
        for (const doc of snap.docs) {
          const d = doc.data() as Partial<Day> | undefined
          if (!d) continue
          next[doc.id] = { ...emptyDay(doc.id), ...d, date: doc.id }
        }
        for (const date of new Set([...Object.keys(next), ...Object.keys(daysRef.current)])) {
          if (!isPending(daysCol.doc(date).path)) continue
          if (daysRef.current[date]) next[date] = daysRef.current[date]
          else delete next[date]
        }
        daysRef.current = next
        setDays(next)
      }

      // 1) 直近の記録だけ先に読んで画面を出す
      // 2) 続けて全期間を購読し、届いたら直近だけの購読はやめる
      const f3 = once()
      let stopRecent: (() => void) | null = null
      let fullStarted = false
      const startFull = () => {
        if (fullStarted || cancelled) return
        fullStarted = true
        let first = true
        unsubs.push(
          daysCol.onSnapshot(
            (snap) => {
              stopRecent?.()
              stopRecent = null
              applyDays(snap)
              f3()
              if (first) {
                first = false
                setHistoryLoaded(true)
                history.current.resolve()
                mark(`全期間の記録（${snap.docs.length}日分）`)
              }
            },
            (e) => {
              history.current.reject(e)
              onErr(f3)(e)
            },
          ),
        )
      }
      stopRecent = daysCol.where('date', '>=', addDays(todayKey(), -RECENT_DAYS)).onSnapshot(
        (snap) => {
          applyDays(snap)
          if (!fullStarted) mark(`直近の記録（${snap.docs.length}日分）`)
          f3()
          startFull()
        },
        (e) => {
          // 絞り込みで読めなかったときは、従来どおり全期間を読む
          console.error(e)
          stopRecent = null
          startFull()
        },
      )
      unsubs.push(() => stopRecent?.())
    })
    return () => {
      cancelled = true
      unsubs.forEach((u) => u())
      unsubs = []
    }
  }, [toast])

  const enqueue = useCallback(
    (key: string, write: () => Promise<void>): Promise<void> => {
      const prev = queues.current.get(key) ?? Promise.resolve()
      pending.current.set(key, (pending.current.get(key) ?? 0) + 1)
      const run = prev
        .catch(() => {})
        .then(write)
        .finally(() => pending.current.set(key, (pending.current.get(key) ?? 1) - 1))
      queues.current.set(key, run)
      return run.catch((e) => {
        console.error(e)
        toast(writeErrorText(e))
        throw e
      })
    },
    [toast],
  )

  const dayOf = useCallback((date: string) => days[date] ?? emptyDay(date), [days])

  const changeDay = useCallback(
    async (date: string, fn: (d: Day) => Day) => {
      const r = refs.current
      if (!r) return
      const next = fn(structuredClone(daysRef.current[date] ?? emptyDay(date)))
      const copy = { ...daysRef.current }
      if (isEmptyDay(next)) delete copy[date]
      else copy[date] = next
      daysRef.current = copy
      setDays(copy)
      const ref = r.day(date)
      await enqueue(ref.path, () => (isEmptyDay(next) ? ref.delete() : ref.set(plain(next))))
    },
    [enqueue],
  )

  const changeLists = useCallback(
    async (fn: (l: Lists) => Lists) => {
      const r = refs.current
      if (!r) return
      const next = fn(structuredClone(listsRef.current))
      listsRef.current = next
      setLists(next)
      await enqueue(r.lists.path, () => r.lists.set(plain(next)))
    },
    [enqueue],
  )

  const updateProfile = useCallback(
    async (p: Profile) => {
      const r = refs.current
      if (!r) return
      setProfile(p)
      await enqueue(r.app.path, () => r.app.set(plain({ profile: p })))
    },
    [enqueue],
  )

  const upsertMeal = useCallback(
    (date: string, meal: Meal) =>
      changeDay(date, (d) => {
        const i = d.meals.findIndex((m) => m.id === meal.id)
        if (i >= 0) d.meals[i] = meal
        else d.meals.push(meal)
        return d
      }),
    [changeDay],
  )

  const deleteMeal = useCallback(
    (date: string, mealId: string) =>
      changeDay(date, (d) => {
        d.meals = d.meals.filter((m) => m.id !== mealId)
        // 献立から記録したものなら、献立側の「記録済」も外す
        d.plans = d.plans.map((p) => (p.loggedMealId === mealId ? { ...p, loggedMealId: undefined } : p))
        return d
      }),
    [changeDay],
  )

  const addWater = useCallback(
    (date: string, deltaMl: number) =>
      changeDay(date, (d) => {
        d.waterMl = Math.max((d.waterMl ?? 0) + deltaMl, 0)
        return d
      }),
    [changeDay],
  )

  const uploadPhoto = useCallback(
    async (blob: Blob) => {
      const a = platform?.assets
      if (!a) return null
      try {
        return (await a.upload(blob, blob.type ? undefined : { type: 'image/jpeg' })).id
      } catch (e) {
        console.error(e)
        toast('写真を保存できませんでした。写真なしで記録します')
        return null
      }
    },
    [platform, toast],
  )

  const deletePhoto = useCallback(
    async (id: string) => {
      try {
        await platform?.assets?.delete(id)
      } catch (e) {
        console.error(e)
      }
    },
    [platform],
  )

  const whenHistoryLoaded = useCallback(() => history.current.promise.then(() => daysRef.current), [])

  const resetAll = useCallback(async () => {
    const r = refs.current
    if (!r) return
    // 古い記録や写真を消し残さないよう、全期間を読み終えてから消す
    await whenHistoryLoaded()
    const photoIds = Object.values(daysRef.current).flatMap((d) => d.meals.map((m) => m.photoId).filter((x): x is string => !!x))
    for (const date of Object.keys(daysRef.current)) await changeDay(date, () => emptyDay(date))
    await changeLists(() => EMPTY_LISTS)
    setProfile(null)
    await enqueue(r.app.path, () => r.app.set({}))
    for (const id of photoIds) await deletePhoto(id)
  }, [changeDay, changeLists, enqueue, deletePhoto, whenHistoryLoaded])

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...o, resolve })), [])
  const closeAsk = (ok: boolean) => {
    ask?.resolve(ok)
    setAsk(null)
  }

  const value = useMemo<Store>(
    () => ({
      status,
      platform,
      profile,
      targets: calcTargets(profile ?? DEFAULT_PROFILE),
      days,
      historyLoaded,
      whenHistoryLoaded,
      lists,
      dayOf,
      updateProfile,
      changeDay,
      upsertMeal,
      deleteMeal,
      addWater,
      changeLists,
      uploadPhoto,
      deletePhoto,
      resetAll,
      toast,
      confirm,
    }),
    [status, platform, profile, days, historyLoaded, whenHistoryLoaded, lists, dayOf, updateProfile, changeDay, upsertMeal, deleteMeal, addWater, changeLists, uploadPhoto, deletePhoto, resetAll, toast, confirm],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet open={ask !== null} onClose={() => closeAsk(false)} title={ask?.title ?? ''}>
        {ask?.message && <p className="confirm-text">{ask.message}</p>}
        <div className="btn-col">
          <button className={ask?.danger ? 'btn btn-danger block' : 'btn btn-primary block'} onClick={() => closeAsk(true)}>
            {ask?.okLabel}
          </button>
          <button className="btn btn-outline block" onClick={() => closeAsk(false)}>
            やめる
          </button>
        </div>
      </Sheet>
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
