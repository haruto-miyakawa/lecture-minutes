import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const HISTORY_DIR = join(process.cwd(), 'data', 'history')

export interface HistoryEntry {
  id: string
  fileName: string
  minutes: string
  transcription?: string
  engine: string
  whisperModel?: string
  duration?: number  // 処理時間（秒）
  createdAt: string
}

export type HistoryListItem = Omit<HistoryEntry, 'minutes' | 'transcription'>

async function ensureDir(): Promise<void> {
  if (!existsSync(HISTORY_DIR)) {
    await mkdir(HISTORY_DIR, { recursive: true })
  }
}

export async function saveHistory(entry: Omit<HistoryEntry, 'id'>): Promise<string> {
  await ensureDir()
  const id = Date.now().toString()
  await writeFile(join(HISTORY_DIR, `${id}.json`), JSON.stringify({ id, ...entry }, null, 2), 'utf-8')
  return id
}

export async function listHistory(): Promise<HistoryListItem[]> {
  await ensureDir()
  const files = await readdir(HISTORY_DIR)
  const items = await Promise.all(
    files
      .filter(f => f.endsWith('.json'))
      .map(async (f) => {
        const raw = await readFile(join(HISTORY_DIR, f), 'utf-8')
        const { minutes: _minutes, transcription: _transcription, ...item } = JSON.parse(raw) as HistoryEntry
        return item
      })
  )
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getHistory(id: string): Promise<HistoryEntry | null> {
  // パストラバーサル防止：IDは数字のみ
  if (!/^\d+$/.test(id)) return null
  try {
    const raw = await readFile(join(HISTORY_DIR, `${id}.json`), 'utf-8')
    return JSON.parse(raw) as HistoryEntry
  } catch {
    return null
  }
}

export async function deleteHistory(id: string): Promise<void> {
  if (!/^\d+$/.test(id)) throw new Error('Invalid id')
  await unlink(join(HISTORY_DIR, `${id}.json`))
}
