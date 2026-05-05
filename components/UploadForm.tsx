'use client'

import { useEffect, useRef, useState } from 'react'
import MinutesViewer from './MinutesViewer'

type Step = 'idle' | 'transcribing' | 'summarizing' | 'done' | 'error'

interface State {
  step: Step
  fileName?: string
  transcription?: string
  minutes?: string
  error?: string
  engine?: string
}

type ProgressStep = {
  label: string
  description: string
  // 推定処理時間（ms）。タイマーの速度調整に使う
  estimatedMs: number
}

const PROGRESS_STEPS: ProgressStep[] = [
  { label: 'アップロード', description: 'ファイルをサーバーに送信',          estimatedMs: 3000  },
  { label: '文字起こし',   description: 'Whisper（GPU）で音声を解析中',      estimatedMs: 60000 },
  { label: '議事録生成',   description: 'Gemini 2.5 Flashで整形中',          estimatedMs: 15000 },
]

const STEP_INDEX: Record<Exclude<Step, 'idle' | 'done' | 'error'>, number> = {
  transcribing: 1,
  summarizing:  2,
}

const TICK_MS = 300
// 90%まで推定時間をかけて到達させる
function calcIncrement(estimatedMs: number): number {
  return (90 / (estimatedMs / TICK_MS))
}

interface UploadFormProps {
  autoSave: boolean
  onSaveHistory: (fileName: string, minutes: string, engine: string) => Promise<void>
}

export default function UploadForm({ autoSave, onSaveHistory }: UploadFormProps) {
  const [state, setState] = useState<State>({ step: 'idle' })
  const [stepProgress, setStepProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 文字起こし中はSSEから実際の進捗を受け取るのでタイマー不要
  // 議事録生成中のみタイマーで推定進捗を表示
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (state.step === 'transcribing') {
      setStepProgress(0)
      return
    }
    if (state.step !== 'summarizing') return
    setStepProgress(0)
    const increment = calcIncrement(PROGRESS_STEPS[STEP_INDEX['summarizing']].estimatedMs)
    timerRef.current = setInterval(() => {
      setStepProgress((prev) => Math.min(prev + increment, 90))
    }, TICK_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state.step])

  async function handleFile(file: File) {
    if (!/\.(mp3|m4a)$/i.test(file.name)) {
      setState({ step: 'error', error: 'mp3またはm4aファイルを選択してください' })
      return
    }

    setState({ step: 'transcribing', fileName: file.name })

    // Step 1: 文字起こし（SSEストリームで進捗をリアルタイム受信）
    let transcription: string
    let engine: string | undefined
    try {
      const formData = new FormData()
      formData.append('audio', file)
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
      if (!res.ok || !res.body) {
        const errData = await res.json() as { error?: string }
        throw new Error(errData.error ?? '文字起こしに失敗しました')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let resolved = false
      while (!resolved) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value)
        const blocks = sseBuffer.split('\n\n')
        sseBuffer = blocks.pop() ?? ''
        for (const block of blocks) {
          const line = block.trim()
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6)) as {
            type: string; pct?: number; text?: string; engine?: string; message?: string
          }
          if (event.type === 'progress' && event.pct !== undefined) {
            setStepProgress(event.pct)
          } else if (event.type === 'done' && event.text) {
            transcription = event.text
            engine = event.engine
            resolved = true
          } else if (event.type === 'error') {
            throw new Error(event.message ?? '文字起こしに失敗しました')
          }
        }
      }
      if (!transcription!) throw new Error('文字起こし結果が空でした')
    } catch (err) {
      setState({ step: 'error', error: err instanceof Error ? err.message : '文字起こしに失敗しました' })
      return
    }

    setState((prev) => ({ ...prev, step: 'summarizing', transcription, engine }))

    // Step 2: 議事録生成
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription }),
      })
      const data = await res.json() as { minutes?: string; error?: string }
      if (!res.ok || !data.minutes) {
        throw new Error(data.error ?? '議事録の生成に失敗しました')
      }
      if (autoSave) {
        await onSaveHistory(file.name, data.minutes, engine ?? 'unknown')
      }
      setState((prev) => ({ ...prev, step: 'done', minutes: data.minutes }))
    } catch (err) {
      setState({ step: 'error', error: err instanceof Error ? err.message : '議事録の生成に失敗しました' })
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function reset() {
    setState({ step: 'idle' })
    setStepProgress(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (state.step === 'done' && state.minutes) {
    return (
      <MinutesViewer
        minutes={state.minutes}
        fileName={state.fileName}
        onReset={reset}
        onSave={autoSave ? undefined : () => onSaveHistory(state.fileName ?? '', state.minutes!, state.engine ?? 'unknown')}
      />
    )
  }

  if (state.step === 'transcribing' || state.step === 'summarizing') {
    const currentIndex = STEP_INDEX[state.step]
    return (
      <div className="flex flex-col items-center gap-8 py-12 w-full max-w-sm mx-auto">
        {state.fileName && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 truncate max-w-full">
            {state.fileName}
          </p>
        )}
        {state.engine === 'openai-whisper' && (
          <div className="w-full rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/40 px-4 py-2.5 flex items-center gap-2">
            <span className="text-yellow-500 text-base">⚠</span>
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              faster-whisperが使えないため、openai-whisper（低速）で処理しています
            </p>
          </div>
        )}
        <ol className="w-full flex flex-col gap-4">
          {PROGRESS_STEPS.map((s, i) => {
            const isDone    = i < currentIndex
            const isActive  = i === currentIndex
            const isPending = i > currentIndex
            return (
              <li key={s.label} className="flex items-start gap-4">
                {/* アイコン */}
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold mt-0.5
                  ${isDone    ? 'bg-blue-500 text-white' : ''}
                  ${isActive  ? 'border-2 border-blue-500 text-blue-500' : ''}
                  ${isPending ? 'border-2 border-zinc-300 dark:border-zinc-600 text-zinc-400' : ''}
                `}>
                  {isDone ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isActive ? (
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                {/* テキスト＋プログレスバー */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-medium ${isPending ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}>
                      {s.label}
                    </p>
                    {isActive && (
                      <span className="text-xs font-mono text-blue-500">
                        {Math.round(stepProgress)}%
                      </span>
                    )}
                    {isDone && (
                      <span className="text-xs font-mono text-blue-400">100%</span>
                    )}
                  </div>
                  {isActive && (
                    <>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${stepProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{s.description}</p>
                    </>
                  )}
                  {isDone && (
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-blue-500" />
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  if (state.step === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">エラーが発生しました</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-300 whitespace-pre-wrap break-words">
            {state.error}
          </p>
        </div>
        <button
          onClick={reset}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          やり直す
        </button>
      </div>
    )
  }

  // idle
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="音声ファイルをドラッグ＆ドロップまたはクリックして選択"
      className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-16 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <svg className="w-12 h-12 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
      <div className="text-center">
        <p className="text-zinc-700 dark:text-zinc-300 font-medium">音声ファイルをドロップ</p>
        <p className="text-sm text-zinc-400 mt-1">または クリックして選択</p>
        <p className="text-xs text-zinc-400 mt-2">対応形式: mp3, m4a</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
