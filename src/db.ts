import Dexie, { type Table } from 'dexie'
import type { Attempt, Karte, Report, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'

class AppDB extends Dexie {
  attempts!: Table<Attempt, number>
  reports!: Table<Report, number>
  kartes!: Table<Karte, number>
  kv!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('ap-trainer')
    this.version(1).stores({
      attempts: '++id, questionId, answeredAt',
      reports: '++id, questionId, createdAt',
      kartes: '++id, createdAt, attemptCount',
      kv: 'key',
    })
  }
}

export const db = new AppDB()

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.kv.put({ key: 'settings', value: s })
}

export interface ExportData {
  app: 'ap-trainer'
  version: 1
  exportedAt: number
  attempts: Attempt[]
  reports: Report[]
  kartes: Karte[]
  settings: Settings
}

export async function exportAll(): Promise<ExportData> {
  return {
    app: 'ap-trainer',
    version: 1,
    exportedAt: Date.now(),
    attempts: await db.attempts.toArray(),
    reports: await db.reports.toArray(),
    kartes: await db.kartes.toArray(),
    settings: await loadSettings(),
  }
}

/** エクスポートしたデータで置き換える（現在のデータは消える） */
export async function importAll(data: ExportData): Promise<void> {
  if (data.app !== 'ap-trainer' || data.version !== 1) {
    throw new Error('このアプリのエクスポートファイルではありません')
  }
  await db.transaction('rw', [db.attempts, db.reports, db.kartes, db.kv], async () => {
    await Promise.all([db.attempts.clear(), db.reports.clear(), db.kartes.clear()])
    await db.attempts.bulkAdd(data.attempts)
    await db.reports.bulkAdd(data.reports)
    await db.kartes.bulkAdd(data.kartes)
    await db.kv.put({ key: 'settings', value: data.settings })
  })
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', [db.attempts, db.reports, db.kartes, db.kv], async () => {
    await Promise.all([db.attempts.clear(), db.reports.clear(), db.kartes.clear(), db.kv.clear()])
  })
}
