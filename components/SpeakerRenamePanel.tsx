'use client'

import { useState } from 'react'

export function detectSpeakers(transcription: string): string[] {
  const matches = transcription.match(/話者[A-J]/g) ?? []
  return [...new Set(matches)]
}

function applyRenames(text: string, renames: Record<string, string>): string {
  return Object.entries(renames).reduce(
    (acc, [from, to]) => to.trim() ? acc.replaceAll(from, to.trim()) : acc,
    text
  )
}

interface SpeakerRenamePanelProps {
  transcription: string
  minutes: string
  onApply: (transcription: string, minutes: string) => void
  onClose: () => void
}

export default function SpeakerRenamePanel({ transcription, minutes, onApply, onClose }: SpeakerRenamePanelProps) {
  const speakers = detectSpeakers(transcription)
  const [renames, setRenames] = useState<Record<string, string>>(
    Object.fromEntries(speakers.map(s => [s, '']))
  )

  const hasAnyInput = Object.values(renames).some(v => v.trim() !== '')

  function handleApply() {
    onApply(
      applyRenames(transcription, renames),
      applyRenames(minutes, renames),
    )
  }

  return (
    <div className="w-full rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-sand-800 dark:text-sand-200">話者名を変更</p>
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

      <p className="text-xs text-sand-400">入力した名前が議事録・文字起こし両方に一括反映されます。空欄の話者は変更されません。</p>

      <div className="flex flex-col gap-2">
        {speakers.map(speaker => (
          <div key={speaker} className="flex items-center gap-3">
            <span className="text-sm text-sand-600 dark:text-sand-400 w-14 shrink-0 font-medium">{speaker}</span>
            <svg className="w-4 h-4 text-sand-300 dark:text-sand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <input
              type="text"
              placeholder="新しい名前（例：田中先生）"
              value={renames[speaker] ?? ''}
              onChange={e => setRenames(prev => ({ ...prev, [speaker]: e.target.value }))}
              className="flex-1 text-sm rounded border border-sand-300 dark:border-sand-600 bg-white dark:bg-sand-900 text-sand-700 dark:text-sand-300 placeholder-sand-300 dark:placeholder-sand-600 px-2.5 py-1 outline-none focus:ring-1 focus:ring-purple-400"
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleApply}
        disabled={!hasAnyInput}
        className="self-start flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        適用
      </button>
    </div>
  )
}
