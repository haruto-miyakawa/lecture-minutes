'use client'

import { useState } from 'react'

interface Segment {
  id: number
  timestamp: string
  text: string
  raw: string
  selected: boolean
}

function parseSegments(transcription: string): Segment[] {
  return transcription
    .split('\n')
    .filter(l => l.trim())
    .map((line, i) => {
      const match = line.match(/^\[(\d{2}:\d{2})\]\s*(.*)$/)
      return {
        id: i,
        timestamp: match?.[1] ?? '',
        text: match?.[2] ?? line,
        raw: line,
        selected: true,
      }
    })
}

interface RegenPanelProps {
  transcription: string
  templatePrompt?: string
  onResult: (minutes: string) => void
  onClose: () => void
}

export default function RegeneratePanel({ transcription, templatePrompt, onResult, onClose }: RegenPanelProps) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [segments, setSegments] = useState<Segment[]>(() => parseSegments(transcription))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasTimestamps = segments.some(s => s.timestamp !== '')
  const selectedCount = segments.filter(s => s.selected).length

  function toggleSegment(id: number) {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s))
  }

  function toggleAll(selected: boolean) {
    setSegments(prev => prev.map(s => ({ ...s, selected })))
  }

  async function handleRegenerate() {
    setIsLoading(true)
    setError(null)
    try {
      const text = mode === 'full'
        ? transcription
        : segments.filter(s => s.selected).map(s => s.raw).join('\n')

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription: text, systemPrompt: templatePrompt }),
      })
      const data = await res.json() as { minutes?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? '再生成に失敗しました')
      onResult(data.minutes ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : '再生成に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-sand-800 dark:text-sand-200">文字起こしから再生成</p>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-400"
          aria-label="閉じる"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* タイムスタンプがある場合のみ部分指定モードを表示 */}
      {hasTimestamps && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode('full')}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              mode === 'full'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'border-sand-300 dark:border-sand-600 text-sand-600 dark:text-sand-400 hover:bg-sand-100 dark:hover:bg-sand-800'
            }`}
          >
            全文から再生成
          </button>
          <button
            onClick={() => setMode('partial')}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              mode === 'partial'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'border-sand-300 dark:border-sand-600 text-sand-600 dark:text-sand-400 hover:bg-sand-100 dark:hover:bg-sand-800'
            }`}
          >
            部分指定
          </button>
        </div>
      )}

      {/* 部分指定モード: セグメント選択 */}
      {mode === 'partial' && hasTimestamps && (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => toggleAll(true)} className="text-xs text-blue-500 hover:underline">全て選択</button>
            <span className="text-xs text-sand-300 dark:text-sand-600">·</span>
            <button onClick={() => toggleAll(false)} className="text-xs text-blue-500 hover:underline">全て解除</button>
            <span className="text-xs text-sand-400 ml-auto">{selectedCount} / {segments.length} 行</span>
          </div>
          <div className="max-h-52 overflow-y-auto flex flex-col gap-0.5 rounded border border-sand-200 dark:border-sand-700 bg-white dark:bg-sand-900 p-2">
            {segments.map(seg => (
              <label
                key={seg.id}
                className="flex items-start gap-2 cursor-pointer hover:bg-sand-50 dark:hover:bg-sand-800 px-1 py-0.5 rounded"
              >
                <input
                  type="checkbox"
                  checked={seg.selected}
                  onChange={() => toggleSegment(seg.id)}
                  className="mt-0.5 w-3.5 h-3.5 accent-blue-500 shrink-0"
                />
                <span className="text-xs text-sand-700 dark:text-sand-300 leading-relaxed">
                  {seg.timestamp && (
                    <span className="font-mono text-sand-400 mr-1.5">[{seg.timestamp}]</span>
                  )}
                  {seg.text}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleRegenerate}
        disabled={isLoading || (mode === 'partial' && selectedCount === 0)}
        className="flex items-center gap-1.5 self-start text-xs px-3 py-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
      >
        {isLoading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            生成中...
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {mode === 'partial' ? `${selectedCount}行から再生成` : '議事録を再生成'}
          </>
        )}
      </button>
    </div>
  )
}
