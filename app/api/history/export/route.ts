import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { zipSync, strToU8 } from 'fflate'
import type { HistoryEntry } from '@/lib/history'

const HISTORY_DIR = join(process.cwd(), 'data', 'history')

// ファイル名として使えない文字を除去
function safeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '_')
}

export async function GET(): Promise<Response> {
  let files: string[] = []
  if (existsSync(HISTORY_DIR)) {
    files = (await readdir(HISTORY_DIR)).filter(f => f.endsWith('.json'))
  }

  const entries = await Promise.all(
    files.map(async (f) => {
      const raw = await readFile(join(HISTORY_DIR, f), 'utf-8')
      return JSON.parse(raw) as HistoryEntry
    })
  )

  const zipFiles: Record<string, Uint8Array> = {}

  // 全データをまとめたJSONを同梱（再インポート・分析用）
  zipFiles['history.json'] = strToU8(JSON.stringify(entries, null, 2))

  for (const entry of entries) {
    const date = entry.createdAt.slice(0, 10)
    const base = safeName(`${date}_${entry.fileName.replace(/\.(mp3|m4a)$/i, '')}`)
    zipFiles[`minutes/${base}.md`] = strToU8(entry.minutes)
    if (entry.transcription) {
      zipFiles[`transcriptions/${base}.txt`] = strToU8(entry.transcription)
    }
  }

  const zipped = zipSync(zipFiles)
  const today = new Date().toISOString().slice(0, 10)

  return new Response(zipped.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="lecture-minutes-backup-${today}.zip"`,
    },
  })
}
