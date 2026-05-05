'use client'

import { useEffect, useRef, useState } from 'react'

interface MaterialData {
  type: 'text' | 'pdf'
  content: string
  fileName: string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export interface BlackoutPeriod {
  id: string
  start: string  // "HH:MM"
  end: string    // "HH:MM"
}

export interface Segment {
  start: number
  end: number
  text: string
  speaker?: string
}

interface QueueItem {
  id: string
  file: File
  fileName: string
  whisperModel: string
  diarize: boolean
  forceHallucinationSafe: boolean
  status: 'pending' | 'waiting' | 'processing' | 'done' | 'error' | 'cancelled'
  activeStep: 'downloading' | 'transcribing' | 'retrying' | 'diarizing' | 'summarizing' | null
  stepProgress: number
  minutes?: string
  transcription?: string
  segments?: Segment[]
  engine?: string
  duration?: number  // 処理時間（秒）
  error?: string
}

interface QueueManagerProps {
  autoSave: boolean
  whisperModel: string
  defaultDiarize: boolean
  templatePrompt: string | null
  blackoutPeriods: BlackoutPeriod[]
  onSaveHistory: (fileName: string, minutes: string, engine: string, transcription: string, whisperModel: string, duration: number) => Promise<void>
  onViewMinutes: (minutes: string, transcription: string, fileName: string, audioFile: File, segments: Segment[], onClose: () => void, onReanalyze: () => void) => void
}

function parseTimeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function isInBlackout(periods: BlackoutPeriod[]): boolean {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  return periods.some(({ start, end }) => {
    const s = parseTimeToMins(start)
    const e = parseTimeToMins(end)
    return s <= e ? mins >= s && mins < e : mins >= s || mins < e
  })
}

function getBlackoutEndTime(periods: BlackoutPeriod[]): string {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  for (const { start, end } of periods) {
    const s = parseTimeToMins(start)
    const e = parseTimeToMins(end)
    if (s <= e ? mins >= s && mins < e : mins >= s || mins < e) return end
  }
  return ''
}

// ---- QueueItemRow ----

const WHISPER_MODELS = [
  { value: 'large-v3', label: 'large-v3' },
  { value: 'medium',   label: 'medium' },
  { value: 'small',    label: 'small' },
  { value: 'base',     label: 'base' },
]

interface QueueItemRowProps {
  item: QueueItem
  blackoutEnd: string
  onRemove: () => void
  onView: () => void
  onCancel: () => void
  onRetry: () => void
  onModelChange: (model: string) => void
  onDiarizeChange: (diarize: boolean) => void
}

function QueueItemRow({ item, blackoutEnd, onRemove, onView, onCancel, onRetry, onModelChange, onDiarizeChange }: QueueItemRowProps) {
  const STATUS = {
    pending:    { label: '待機中',   cls: 'text-sand-400' },
    waiting:    { label: '一時停止', cls: 'text-yellow-500' },
    processing: { label: '処理中',   cls: 'text-blue-500' },
    done:       { label: '完了',     cls: 'text-green-500' },
    error:      { label: 'エラー',   cls: 'text-red-500' },
    cancelled:  { label: '停止中',   cls: 'text-sand-400' },
  }
  const { label, cls } = STATUS[item.status]
  const stepLabel = item.activeStep === 'downloading' ? 'モデルをダウンロード中（初回のみ）'
    : item.activeStep === 'transcribing' ? '文字起こし中'
    : item.activeStep === 'retrying' ? '再処理中（ハルシネーション検知）'
    : item.activeStep === 'diarizing' ? '話者分離中'
    : '議事録生成中'

  return (
    <li className="flex items-center gap-3 p-3 rounded-lg border border-sand-200 dark:border-sand-700 bg-sand-50 dark:bg-sand-900">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-sand-800 dark:text-sand-200 truncate max-w-xs">
            {item.fileName}
          </p>
          <span className={`text-xs font-medium shrink-0 ${cls}`}>{label}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {(item.status === 'pending' || item.status === 'cancelled') ? (
            <select
              value={item.whisperModel}
              onChange={e => onModelChange(e.target.value)}
              className="text-xs rounded border border-sand-200 dark:border-sand-700 bg-sand-100 dark:bg-sand-800 text-sand-500 dark:text-sand-400 px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
            >
              {WHISPER_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-sand-400 font-mono">{item.whisperModel}</span>
          )}
          {item.status === 'done' && item.duration !== undefined && (
            <span className="text-xs text-sand-400">
              {item.duration >= 60
                ? `${Math.floor(item.duration / 60)}分${item.duration % 60}秒`
                : `${item.duration}秒`}
            </span>
          )}
          {(item.status === 'pending' || item.status === 'cancelled') ? (
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={item.diarize}
                onChange={e => onDiarizeChange(e.target.checked)}
                className="w-3 h-3 accent-blue-500"
              />
              <span className="text-xs text-sand-500">話者分離</span>
            </label>
          ) : item.diarize ? (
            <span className="text-xs text-sand-400">話者分離あり</span>
          ) : null}
        </div>

        {item.status === 'processing' && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-sand-400">{stepLabel}</span>
              {(item.activeStep === 'downloading' || item.activeStep === 'transcribing') ? (
                <span className="text-xs font-mono text-blue-500">{Math.round(item.stepProgress)}%</span>
              ) : (
                <span className="text-xs text-sand-400 animate-pulse">処理中...</span>
              )}
            </div>
            {(item.activeStep === 'downloading' || item.activeStep === 'transcribing') && (
              <div className="h-1.5 rounded-full bg-sand-200 dark:bg-sand-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${item.stepProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {item.status === 'waiting' && blackoutEnd && (
          <p className="text-xs text-yellow-500 mt-1">処理禁止時間帯のため {blackoutEnd} まで待機中</p>
        )}

        {item.status === 'error' && item.error && (
          <p className="text-xs text-red-400 mt-1 truncate" title={item.error}>{item.error}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {item.status === 'done' && (
          <button
            onClick={onView}
            className="text-xs px-2.5 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600"
          >
            議事録を見る
          </button>
        )}
        {item.status === 'processing' && (
          <button
            onClick={onCancel}
            aria-label="停止"
            className="text-xs px-2.5 py-1 rounded-md border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            停止
          </button>
        )}
        {item.status === 'cancelled' && (
          <>
            <button
              onClick={onRetry}
              className="text-xs px-2.5 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600"
            >
              再解析
            </button>
            <button
              onClick={onRemove}
              aria-label="削除"
              className="p-1 rounded hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
        {(item.status === 'pending' || item.status === 'error') && (
          <button
            onClick={onRemove}
            aria-label="削除"
            className="p-1 rounded hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-400"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </li>
  )
}

// ---- QueueManager ----

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function QueueManager({ autoSave, whisperModel, defaultDiarize, templatePrompt, blackoutPeriods, onSaveHistory, onViewMinutes }: QueueManagerProps) {
  const queueRef = useRef<QueueItem[]>([])
  const [, forceUpdate] = useState(0)
  const processingRef = useRef(false)
  const autoSaveRef = useRef(autoSave)
  const blackoutRef = useRef(blackoutPeriods)
  const onSaveHistoryRef = useRef(onSaveHistory)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const materialInputRef = useRef<HTMLInputElement>(null)

  const [material, setMaterial] = useState<MaterialData | null>(null)
  const materialRef = useRef<MaterialData | null>(null)
  const templatePromptRef = useRef<string | null>(templatePrompt)

  useEffect(() => { autoSaveRef.current = autoSave }, [autoSave])
  useEffect(() => { blackoutRef.current = blackoutPeriods }, [blackoutPeriods])
  useEffect(() => { onSaveHistoryRef.current = onSaveHistory }, [onSaveHistory])
  useEffect(() => { materialRef.current = material }, [material])
  useEffect(() => { templatePromptRef.current = templatePrompt }, [templatePrompt])

  function updateQueue(updater: (prev: QueueItem[]) => QueueItem[]): void {
    queueRef.current = updater(queueRef.current)
    forceUpdate(n => n + 1)
  }

  function patchItem(id: string, patch: Partial<QueueItem>): void {
    updateQueue(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  function requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }

  function notify(title: string, body: string): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  }

  function addFiles(files: FileList | File[]): void {
    const valid = Array.from(files).filter(f => /\.(mp3|m4a)$/i.test(f.name))
    if (valid.length === 0) return
    requestNotificationPermission()
    updateQueue(prev => [
      ...prev,
      ...valid.map(f => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: f, fileName: f.name,
        whisperModel,
        diarize: defaultDiarize,
        forceHallucinationSafe: false,
        status: 'pending' as const,
        activeStep: null, stepProgress: 0,
      })),
    ])
    startProcessing()
  }

  async function handleMaterialFile(file: File): Promise<void> {
    if (file.name.endsWith('.txt') || file.type === 'text/plain') {
      const content = await file.text()
      setMaterial({ type: 'text', content, fileName: file.name })
    } else if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
      const buffer = await file.arrayBuffer()
      const content = arrayBufferToBase64(buffer)
      setMaterial({ type: 'pdf', content, fileName: file.name })
    }
  }

  function cancelCurrent(): void {
    abortControllerRef.current?.abort()
  }

  async function startProcessing(): Promise<void> {
    if (processingRef.current) return
    processingRef.current = true
    while (true) {
      const item = queueRef.current.find(i => i.status === 'pending' || i.status === 'waiting')
      if (!item) break
      if (isInBlackout(blackoutRef.current)) {
        patchItem(item.id, { status: 'waiting' })
        await new Promise<void>(resolve => {
          // 禁止時間帯が終わるまで30秒ごとにチェック
          const check = () => isInBlackout(blackoutRef.current) ? setTimeout(check, 30000) : resolve()
          setTimeout(check, 30000)
        })
        continue
      }
      patchItem(item.id, { status: 'processing', activeStep: 'transcribing', stepProgress: 0 })
      try {
        await processItem(item.id, item.file, item.whisperModel, item.diarize, item.forceHallucinationSafe)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          patchItem(item.id, { status: 'cancelled', activeStep: null, stepProgress: 0 })
        } else {
          const msg = err instanceof Error ? err.message : '処理に失敗しました'
          patchItem(item.id, { status: 'error', activeStep: null, error: msg })
          notify('処理に失敗しました', `${item.fileName}: ${msg}`)
        }
      }
    }
    processingRef.current = false
  }

  async function processItem(id: string, file: File, itemWhisperModel: string, itemDiarize: boolean, itemForceSafe: boolean): Promise<void> {
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const { signal } = abortController
    const startedAt = Date.now()

    // Step 1: 文字起こし（SSE）
    let transcription = ''         // Gemini へ渡す生テキスト
    let transcriptionDisplay = ''  // タイムスタンプ付き表示用テキスト
    let rawSegments: Segment[] = []
    let engine: string | undefined
    const formData = new FormData()
    formData.append('audio', file)
    formData.append('model', itemWhisperModel)
    formData.append('diarize', itemDiarize ? 'true' : 'false')
    formData.append('forceSafe', itemForceSafe ? 'true' : 'false')
    const res = await fetch('/api/transcribe', { method: 'POST', body: formData, signal })
    if (!res.ok || !res.body) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? '文字起こしに失敗しました')
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let done = false
    while (!done) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      sseBuffer += decoder.decode(value)
      const blocks = sseBuffer.split('\n\n')
      sseBuffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const line = block.trim()
        if (!line.startsWith('data: ')) continue
        const event = JSON.parse(line.slice(6)) as {
          type: string; pct?: number; diarizing?: boolean; retrying?: boolean
          text?: string; engine?: string; message?: string
          segments?: { start: number; end: number; text: string; speaker?: string }[]
        }
        if (event.type === 'downloading' && event.pct !== undefined) {
          patchItem(id, { stepProgress: event.pct, activeStep: 'downloading' })
        } else if (event.type === 'progress' && event.pct !== undefined) {
          patchItem(id, {
            stepProgress: event.pct,
            activeStep: event.retrying ? 'retrying' : event.diarizing ? 'diarizing' : 'transcribing',
          })
        } else if (event.type === 'done' && event.text) {
          transcription = event.text
          engine = event.engine
          if (event.segments && event.segments.length > 0) {
            rawSegments = event.segments
            transcriptionDisplay = event.segments
              .map(s => `[${formatTimestamp(s.start)}] ${s.speaker ? `${s.speaker}: ` : ''}${s.text}`)
              .join('\n')
          } else {
            transcriptionDisplay = event.text
          }
          done = true
        } else if (event.type === 'error') {
          throw new Error(event.message ?? '文字起こしに失敗しました')
        }
      }
    }
    if (!transcription) throw new Error('文字起こし結果が空でした')

    // Step 2: 議事録生成（講義資料があれば一緒に送る）
    patchItem(id, { activeStep: 'summarizing', stepProgress: 0 })
    const currentMaterial = materialRef.current
    const sumBody: {
      transcription: string
      material?: { type: 'text' | 'pdf'; content: string }
      systemPrompt?: string
    } = { transcription }
    if (currentMaterial) {
      sumBody.material = { type: currentMaterial.type, content: currentMaterial.content }
    }
    if (templatePromptRef.current) {
      sumBody.systemPrompt = templatePromptRef.current
    }
    const sumRes = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sumBody),
      signal,
    })
    const sumData = await sumRes.json() as { minutes?: string; error?: string }
    if (!sumRes.ok || !sumData.minutes) throw new Error(sumData.error ?? '議事録の生成に失敗しました')

    const duration = Math.round((Date.now() - startedAt) / 1000)
    if (autoSaveRef.current) {
      await onSaveHistoryRef.current(file.name, sumData.minutes, engine ?? 'unknown', transcriptionDisplay, itemWhisperModel, duration)
    }
    patchItem(id, { status: 'done', activeStep: null, minutes: sumData.minutes, transcription: transcriptionDisplay, segments: rawSegments, engine, duration })
    notify('議事録が完成しました', file.name)
  }

  const queue = queueRef.current
  const blackoutEnd = getBlackoutEndTime(blackoutRef.current)

  return (
    <div className="flex flex-col gap-6">
      <div
        role="button" tabIndex={0}
        aria-label="音声ファイルをドラッグ＆ドロップまたはクリックして選択"
        className="flex items-center justify-center gap-4 rounded-xl border-2 border-dashed border-sand-300 dark:border-sand-700 p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
        onDragOver={e => e.preventDefault()}
      >
        <svg className="w-8 h-8 text-sand-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <div>
          <p className="text-sand-700 dark:text-sand-300 font-medium">音声ファイルをドロップ</p>
          <p className="text-sm text-sand-400 mt-0.5">複数ファイル同時追加対応 · mp3, m4a</p>
        </div>
        <input ref={inputRef} type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a" multiple className="hidden"
          onChange={e => { if (e.target.files) addFiles(e.target.files) }} />
      </div>

      {/* 講義資料（任意） */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-sm text-sand-600 dark:text-sand-400 shrink-0">講義資料</span>
        {material ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <svg className="w-4 h-4 text-sand-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm text-sand-700 dark:text-sand-300 truncate">{material.fileName}</span>
            <button
              onClick={() => setMaterial(null)}
              className="text-sand-400 hover:text-red-400 shrink-0 ml-auto"
              aria-label="講義資料を削除"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => materialInputRef.current?.click()}
            className="text-sm px-3 py-1 rounded-md border border-sand-300 dark:border-sand-600 text-sand-600 dark:text-sand-400 hover:bg-sand-100 dark:hover:bg-sand-800 transition-colors"
          >
            ファイルを選択
          </button>
        )}
        <input
          ref={materialInputRef}
          type="file"
          accept=".txt,.pdf,text/plain,application/pdf"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) void handleMaterialFile(e.target.files[0]) }}
        />
        <span className="text-xs text-sand-400 shrink-0">txt · pdf</span>
      </div>

      {queue.length > 0 && (
        <ul className="flex flex-col gap-2">
          {queue.map(item => (
            <QueueItemRow
              key={item.id}
              item={item}
              blackoutEnd={item.status === 'waiting' ? blackoutEnd : ''}
              onRemove={() => updateQueue(prev => prev.filter(i => i.id !== item.id))}
              onView={() => item.minutes && onViewMinutes(
                item.minutes,
                item.transcription ?? '',
                item.fileName,
                item.file,
                item.segments ?? [],
                () => updateQueue(prev => prev.filter(i => i.id !== item.id)),
                () => {
                  patchItem(item.id, { status: 'pending', stepProgress: 0, minutes: undefined, forceHallucinationSafe: true })
                  startProcessing()
                }
              )}
              onCancel={cancelCurrent}
              onRetry={() => {
                patchItem(item.id, { status: 'pending', stepProgress: 0 })
                startProcessing()
              }}
              onModelChange={model => patchItem(item.id, { whisperModel: model })}
              onDiarizeChange={d => patchItem(item.id, { diarize: d })}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
