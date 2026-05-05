import type { NextRequest } from 'next/server'
import { listHistory, saveHistory } from '@/lib/history'

export async function GET(): Promise<Response> {
  try {
    const items = await listHistory()
    return Response.json(items)
  } catch (err) {
    console.error('[GET /api/history]', err)
    return Response.json({ error: '履歴の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { fileName, minutes, engine, transcription, whisperModel, duration } = await request.json() as {
      fileName: string
      minutes: string
      engine: string
      transcription?: string
      whisperModel?: string
      duration?: number
    }
    const id = await saveHistory({ fileName, minutes, engine, transcription, whisperModel, duration, createdAt: new Date().toISOString() })
    return Response.json({ id })
  } catch (err) {
    console.error('[POST /api/history]', err)
    return Response.json({ error: '履歴の保存に失敗しました' }, { status: 500 })
  }
}
