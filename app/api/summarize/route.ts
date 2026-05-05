import type { NextRequest } from 'next/server'
import { formatMinutes, type MaterialContext } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { transcription?: unknown; material?: unknown; systemPrompt?: unknown }
    const { transcription, material, systemPrompt } = body

    if (typeof transcription !== 'string' || transcription.trim().length === 0) {
      return Response.json({ error: 'transcriptionが必要です' }, { status: 400 })
    }

    let materialCtx: MaterialContext | undefined
    if (
      material !== null && typeof material === 'object' &&
      'type' in material && 'content' in material &&
      (material.type === 'text' || material.type === 'pdf') &&
      typeof material.content === 'string' && material.content.length > 0
    ) {
      materialCtx = { type: material.type as 'text' | 'pdf', content: material.content }
    }

    const customPrompt = typeof systemPrompt === 'string' && systemPrompt.trim() ? systemPrompt.trim() : undefined
    const minutes = await formatMinutes(transcription, materialCtx, customPrompt)
    return Response.json({ minutes })
  } catch (err) {
    const message = err instanceof Error ? err.message : '議事録の生成に失敗しました'
    console.error('[POST /api/summarize]', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
