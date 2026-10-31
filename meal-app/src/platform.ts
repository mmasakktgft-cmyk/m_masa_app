/**
 * claude.ai 上のアプリとして使う機能（window.claude.use）への入口。
 * 型は必要な分だけ書く。どれも、claude.ai の外で開いたときや許可がないときは null になる。
 */

export interface DbSnapshot {
  id: string
  exists: boolean
  data(): Record<string, unknown> | undefined
}
export interface DbQuerySnapshot {
  docs: DbSnapshot[]
}
export interface DbError {
  code: string
  message: string
}
export interface DocRef {
  id: string
  path: string
  get(): Promise<DbSnapshot>
  set(data: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
  onSnapshot(next: (s: DbSnapshot) => void, error?: (e: DbError) => void): () => void
  collection(path: string): CollectionRef
}
export interface Query {
  where(field: string, op: string, value: unknown): Query
  orderBy(field: string, dir?: 'asc' | 'desc'): Query
  limit(n: number): Query
  onSnapshot(next: (s: DbQuerySnapshot) => void, error?: (e: DbError) => void): () => void
  get(): Promise<DbQuerySnapshot>
}
export interface CollectionRef extends Query {
  path: string
  doc(id?: string): DocRef
}
export interface Db {
  doc(path: string): DocRef
  collection(path: string): CollectionRef
}

export interface SampleError {
  code: string
  message: string
  text?: string
}
export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void
  signal?: AbortSignal
  images?: Blob | Blob[]
  modelTier?: 'default' | 'complex' | 'quick'
  cache?: boolean | { gcTime?: number; refresh?: boolean }
}
export interface Sample {
  (input: string, options?: SampleOptions): Promise<{ text: string; truncated: boolean }>
  json<T = unknown>(input: string, options?: SampleOptions): Promise<T>
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>
}

export interface Assets {
  upload(blob: Blob, options?: { type?: string }): Promise<{ id: string; url: string }>
  delete(ref: string): Promise<{ deleted: boolean }>
}

export interface Downloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>
}

export interface Permissions {
  /** 許可の設定画面を開く（拒否した許可を戻すための入口） */
  manage(): Promise<void>
}

export interface User {
  id(): Promise<string | null>
  isOwner(): Promise<boolean>
}

interface ClaudeGlobal {
  use(name: string): Promise<unknown>
}

declare global {
  interface Window {
    claude?: ClaudeGlobal
  }
}

export interface Platform {
  db: Db | null
  uid: string | null
  sample: Sample | null
  /** 写真を Claude に送れるか（起動を待たせないよう、接続後に調べて反映する） */
  canSendImages: boolean
  assets: Assets | null
  downloads: Downloads | null
  permissions: Permissions | null
}

async function use<T>(name: string): Promise<T | null> {
  try {
    return ((await window.claude?.use(name)) as T | null) ?? null
  } catch {
    return null
  }
}

export async function connectPlatform(): Promise<Platform> {
  const [db, user, sample, assets, downloads, permissions] = await Promise.all([
    use<Db>('db'),
    use<User>('user'),
    use<Sample>('sample'),
    use<Assets>('assets'),
    use<Downloads>('downloads'),
    use<Permissions>('permissions'),
  ])
  let uid: string | null = null
  try {
    uid = (await user?.id()) ?? null
  } catch {
    uid = null
  }
  return { db, uid, sample, canSendImages: false, assets, downloads, permissions }
}

/**
 * 写真を Claude に送れるか。ページが写真を送ると宣言していて（capabilities の sample.images）、
 * 開いている画面が対応しているときだけ true。起動時の読み込みを待たせないよう、別に調べる
 */
export async function imagesAvailable(sample: Sample | null): Promise<boolean> {
  try {
    return !!(await sample?.limits())?.images
  } catch {
    return false
  }
}

/** 許可がない・取り消された、を表すエラーか（許可の設定画面へ案内する） */
export const isPermissionError = (e: unknown): boolean => {
  const code = (e as SampleError)?.code
  return code === 'not_granted' || code === 'capability_disabled'
}

/** 保存してある写真の表示用 URL（どの画面からでも同じ形） */
export const photoUrl = (id: string): string => '/_blob/' + id

/** Claude 呼び出しの失敗を、利用者向けの文に */
export function sampleErrorText(e: unknown): string {
  const code = (e as SampleError)?.code
  switch (code) {
    case 'cancelled':
      return ''
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return 'Claude を使う許可がオフになっています。下のボタンから許可するか、手入力で記録してください'
    case 'images_unavailable':
      return 'この画面では写真を Claude に送れません。食べたものを文章で書いて推定してください'
    case 'image_rejected':
      return 'この写真は読み込めませんでした。別の写真で試してください'
    case 'rate_limited':
      return 'Claude の利用が混み合っているか、利用上限に達しています。しばらくしてから試してください'
    case 'session_expired':
      return 'claude.ai に再ログインしてから試してください'
    case 'refused':
      return 'この内容は推定できませんでした。写真や文章を変えて試してください'
    case 'invalid_json':
    case 'empty_completion':
      return '推定結果を読み取れませんでした。もう一度試してください'
    case 'prompt_too_large':
      return '送る内容が多すぎます。短くして試してください'
    default:
      return 'Claude に接続できませんでした。もう一度試してください'
  }
}
