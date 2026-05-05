import type { NextRequest } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'

// Whisperは時間がかかるため最大5分まで許容
export const maxDuration = 300

const ALLOWED_EXTENSIONS = /\.(mp3|m4a)$/i

export async function POST(request: NextRequest): Promise<Response> {
  const formData = await request.formData()
  const file = formData.get('audio')
  const modelParam = formData.get('model')
  const whisperModel = typeof modelParam === 'string' && modelParam.trim() ? modelParam.trim() : 'large-v3'
  const diarize = formData.get('diarize') === 'true'
  const forceSafe = formData.get('forceSafe') === 'true'

  if (!(file instanceof File)) {
    return Response.json({ error: '音声ファイルが指定されていません' }, { status: 400 })
  }
  if (!ALLOWED_EXTENSIONS.test(file.name)) {
    return Response.json({ error: 'mp3またはm4aファイルのみ対応しています' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'mp3'
  const tempPath = join(tmpdir(), `lecture-${Date.now()}.${ext}`)
  await writeFile(tempPath, Buffer.from(await file.arrayBuffer()))

  const encoder = new TextEncoder()
  const scriptPath = join(process.cwd(), 'whisper', 'transcribe.py')
  // .venvのPythonを明示的に使うことでCUDAライブラリが確実に読み込まれる
  const pythonPath = join(process.cwd(), '.venv', 'Scripts', 'python.exe')

  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn(pythonPath, [scriptPath, tempPath, whisperModel, diarize ? 'true' : 'false', forceSafe ? 'true' : 'false'], {
        windowsHide: true,
        // PythonのstdoutをUTF-8として扱う（Windows環境でのcp932混入防止）
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      })

      let stdoutBuf = ''
      let stderrBuf = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf-8')
        const lines = stdoutBuf.split('\n')
        stdoutBuf = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const event = JSON.parse(trimmed)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch {
            console.warn('[transcribe] invalid JSON line:', trimmed)
          }
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf-8')
      })

      proc.on('close', (code: number | null) => {
        unlink(tempPath).catch(e => console.warn('[transcribe] temp cleanup failed:', e))
        if (code !== 0) {
          const msg = `Whisper終了コード ${code}: ${stderrBuf.trim()}`
          console.error('[POST /api/transcribe]', msg)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`))
        }
        controller.close()
      })

      proc.on('error', (err: NodeJS.ErrnoException) => {
        unlink(tempPath).catch(() => {})
        const msg = `Pythonの起動に失敗しました: ${err.message}`
        console.error('[POST /api/transcribe]', msg)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`))
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
