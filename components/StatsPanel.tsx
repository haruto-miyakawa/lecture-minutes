'use client'

import { useEffect, useState } from 'react'
import type { StatsResponse } from '@/app/api/stats/route'

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}時間${rm}分`
}

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  return `${y}/${m}`
}

interface StatsPanelProps {
  onClose: () => void
}

export default function StatsPanel({ onClose }: StatsPanelProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json() as Promise<StatsResponse>)
      .then(setStats)
      .finally(() => setLoading(false))
  }, [])

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/history/export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lecture-minutes-backup-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const maxMonthCount = Math.max(...(stats?.monthlyStats.map(m => m.count) ?? [1]), 1)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-80 bg-sand-100 dark:bg-sand-900 z-50 shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-4 border-b-2 border-sand-300 dark:border-sand-700 bg-sand-200/60 dark:bg-sand-800/60 shrink-0">
          <h2 className="font-semibold text-sand-800 dark:text-sand-200">処理統計</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-500"
            aria-label="閉じる"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-5">
          {loading ? (
            <p className="text-sm text-sand-400">読み込み中...</p>
          ) : !stats ? (
            <p className="text-sm text-sand-400">統計の取得に失敗しました</p>
          ) : (
            <>
              {/* サマリー */}
              <section className="grid grid-cols-2 gap-3">
                <div className="bg-sand-50 dark:bg-sand-800 rounded-lg p-3 flex flex-col gap-0.5">
                  <p className="text-xs text-sand-400">総処理ファイル数</p>
                  <p className="text-2xl font-bold text-sand-800 dark:text-sand-200">{stats.totalFiles}<span className="text-sm font-normal text-sand-400 ml-1">件</span></p>
                </div>
                <div className="bg-sand-50 dark:bg-sand-800 rounded-lg p-3 flex flex-col gap-0.5">
                  <p className="text-xs text-sand-400">累計処理時間</p>
                  <p className="text-lg font-bold text-sand-800 dark:text-sand-200 leading-tight">{formatDuration(stats.totalDuration)}</p>
                </div>
              </section>

              {/* 月別グラフ */}
              <section>
                <p className="text-xs font-semibold text-sand-400 uppercase tracking-wider mb-3">月別処理件数（直近6ヶ月）</p>
                {stats.monthlyStats.every(m => m.count === 0) ? (
                  <p className="text-xs text-sand-400">データがありません</p>
                ) : (
                  <div className="flex items-end gap-1.5 h-28">
                    {stats.monthlyStats.map(({ month, count }) => (
                      <div key={month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-sand-500 font-medium">{count > 0 ? count : ''}</span>
                        <div
                          className="w-full rounded-t-sm bg-blue-400 dark:bg-blue-600 transition-all"
                          style={{ height: `${Math.max(count / maxMonthCount * 72, count > 0 ? 4 : 0)}px` }}
                        />
                        <span className="text-[10px] text-sand-400">{formatMonth(month)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* モデル別統計 */}
              <section>
                <p className="text-xs font-semibold text-sand-400 uppercase tracking-wider mb-3">Whisperモデル別</p>
                {stats.modelStats.length === 0 ? (
                  <p className="text-xs text-sand-400">データがありません</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {stats.modelStats.map(({ model, count, avgDuration }) => (
                      <div key={model} className="flex items-center justify-between bg-sand-50 dark:bg-sand-800 rounded-lg px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-sand-700 dark:text-sand-300 font-mono">{model}</span>
                          <span className="text-xs text-sand-400">平均 {formatDuration(avgDuration)}</span>
                        </div>
                        <span className="text-sm font-semibold text-sand-600 dark:text-sand-400">{count}件</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* 一括エクスポート */}
          <div className="border-t border-sand-200 dark:border-sand-700 pt-4 mt-auto">
            <p className="text-xs text-sand-400 mb-2">議事録・文字起こしを一括でZIPにバックアップします</p>
            <button
              onClick={handleExport}
              disabled={exporting || stats?.totalFiles === 0}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {exporting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  エクスポート中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  全履歴をZIPでエクスポート
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
