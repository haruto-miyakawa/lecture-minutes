'use client'

import { useEffect, useMemo, useState } from 'react'
import QueueManager, { BlackoutPeriod, Segment } from './QueueManager'
import MinutesViewer from './MinutesViewer'
import HelpPanel from './HelpPanel'
import StatsPanel from './StatsPanel'
import { DEFAULT_SYSTEM_PROMPT, PRESET_TEMPLATES } from '@/lib/prompts'

interface Template {
  id: string
  name: string
  prompt: string
}

interface HistoryItem {
  id: string
  fileName: string
  engine: string
  whisperModel?: string
  duration?: number
  createdAt: string
}

interface HistoryEntry extends HistoryItem {
  minutes: string
  transcription?: string
}

export default function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyList, setHistoryList] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null)
  const [viewingQueueMinutes, setViewingQueueMinutes] = useState<{ minutes: string; transcription: string; fileName: string; audioFile: File; segments: Segment[]; onClose: () => void; onReanalyze: () => void } | null>(null)
  const [audioPlayerEnabled, setAudioPlayerEnabled] = useState(false)
  const [blackoutPeriods, setBlackoutPeriods] = useState<BlackoutPeriod[]>([])
  const [newBlackoutStart, setNewBlackoutStart] = useState('23:00')
  const [newBlackoutEnd, setNewBlackoutEnd] = useState('07:00')
  const [whisperModel, setWhisperModel] = useState('large-v3')
  const [defaultDiarize, setDefaultDiarize] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('')
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historySort, setHistorySort] = useState<'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'>('date-desc')
  const [helpOpen, setHelpOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)

  useEffect(() => {
    const bp = localStorage.getItem('blackoutPeriods')
    if (bp) {
      try { setBlackoutPeriods(JSON.parse(bp) as BlackoutPeriod[]) } catch { /* ignore */ }
    }
    const wm = localStorage.getItem('whisperModel')
    if (wm) setWhisperModel(wm)
    if (localStorage.getItem('defaultDiarize') === 'true') setDefaultDiarize(true)
    if (localStorage.getItem('audioPlayerEnabled') === 'true') setAudioPlayerEnabled(true)
    const tmpl = localStorage.getItem('promptTemplates')
    if (tmpl) { try { setTemplates(JSON.parse(tmpl) as Template[]) } catch { /* ignore */ } }
    const activeTmpl = localStorage.getItem('activeTemplateId')
    if (activeTmpl) setActiveTemplateId(activeTmpl)
  }, [])

  async function openHistory(): Promise<void> {
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/history')
      setHistoryList(await res.json() as HistoryItem[])
    } catch (err) {
      console.error('[openHistory]', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function saveHistory(fileName: string, minutes: string, engine: string, transcription: string, whisperModel: string, duration: number): Promise<void> {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, minutes, engine, transcription, whisperModel, duration }),
    })
  }

  function saveTemplates(next: Template[]): void {
    setTemplates(next)
    localStorage.setItem('promptTemplates', JSON.stringify(next))
  }

  function addTemplate(): void {
    if (!newTemplateName.trim() || !newTemplatePrompt.trim()) return
    const next = [...templates, { id: `${Date.now()}`, name: newTemplateName.trim(), prompt: newTemplatePrompt.trim() }]
    saveTemplates(next)
    setNewTemplateName('')
    setNewTemplatePrompt('')
    setShowTemplateForm(false)
  }

  function deleteTemplate(id: string): void {
    saveTemplates(templates.filter(t => t.id !== id))
    if (activeTemplateId === id) {
      setActiveTemplateId(null)
      localStorage.removeItem('activeTemplateId')
    }
  }

  function selectTemplate(id: string | null): void {
    setActiveTemplateId(id)
    if (id) localStorage.setItem('activeTemplateId', id)
    else localStorage.removeItem('activeTemplateId')
  }

  const activeTemplatePrompt = activeTemplateId
    ? (PRESET_TEMPLATES.find(t => t.id === activeTemplateId)?.prompt
        ?? templates.find(t => t.id === activeTemplateId)?.prompt
        ?? null)
    : null

  function addBlackoutPeriod(): void {
    const next: BlackoutPeriod[] = [
      ...blackoutPeriods,
      { id: `${Date.now()}`, start: newBlackoutStart, end: newBlackoutEnd },
    ]
    setBlackoutPeriods(next)
    localStorage.setItem('blackoutPeriods', JSON.stringify(next))
  }

  function removeBlackoutPeriod(id: string): void {
    const next = blackoutPeriods.filter(p => p.id !== id)
    setBlackoutPeriods(next)
    localStorage.setItem('blackoutPeriods', JSON.stringify(next))
  }

  async function handleSelectHistory(id: string): Promise<void> {
    const res = await fetch(`/api/history/${id}`)
    setSelectedEntry(await res.json() as HistoryEntry)
    setHistoryOpen(false)
  }

  async function handleDeleteHistory(id: string, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    await fetch(`/api/history/${id}`, { method: 'DELETE' })
    setHistoryList(prev => prev.filter(h => h.id !== id))
  }

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    const filtered = q
      ? historyList.filter(h => h.fileName.toLowerCase().includes(q))
      : historyList
    return [...filtered].sort((a, b) => {
      switch (historySort) {
        case 'date-desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'date-asc':  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'name-asc':  return a.fileName.localeCompare(b.fileName, 'ja')
        case 'name-desc': return b.fileName.localeCompare(a.fileName, 'ja')
      }
    })
  }, [historyList, historySearch, historySort])

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="flex flex-col flex-1 bg-sand-50 dark:bg-sand-950">
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-4 border-b border-sand-200 dark:border-sand-800 bg-sand-50/95 dark:bg-sand-950/95 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold text-sand-900 dark:text-sand-50">講義議事録ジェネレーター</h1>
          <p className="mt-0.5 text-sm text-sand-500 dark:text-sand-400">
            音声ファイルをアップロードすると、Whisperで文字起こし → Geminiで議事録に整形します
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStatsOpen(true)}
            className="p-2 rounded-md hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-700 dark:text-sand-300"
            aria-label="処理統計を開く"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="p-2 rounded-md hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-700 dark:text-sand-300"
            aria-label="使い方を開く"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={openHistory}
            className="p-2 rounded-md hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-700 dark:text-sand-300"
            aria-label="履歴を開く"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-md hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-700 dark:text-sand-300"
            aria-label="設定を開く"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 w-full max-w-3xl mx-auto">
        {/* QueueManagerは常にマウントしたまま — キュー状態を保持するためhiddenで切り替え */}
        <div className={selectedEntry || viewingQueueMinutes ? 'hidden' : ''}>
          <QueueManager
            autoSave={true}
            whisperModel={whisperModel}
            defaultDiarize={defaultDiarize}
            templatePrompt={activeTemplatePrompt}
            blackoutPeriods={blackoutPeriods}
            onSaveHistory={saveHistory}
            onViewMinutes={(minutes, transcription, fileName, audioFile, segments, onClose, onReanalyze) => setViewingQueueMinutes({ minutes, transcription, fileName, audioFile, segments, onClose, onReanalyze })}
          />
        </div>
        {selectedEntry && (
          <MinutesViewer
            minutes={selectedEntry.minutes}
            transcription={selectedEntry.transcription}
            fileName={selectedEntry.fileName}
            templatePrompt={activeTemplatePrompt ?? undefined}
            onReset={() => setSelectedEntry(null)}
            onMinutesChange={m => setSelectedEntry(prev => prev ? { ...prev, minutes: m } : prev)}
          />
        )}
        {viewingQueueMinutes && (
          <MinutesViewer
            minutes={viewingQueueMinutes.minutes}
            transcription={viewingQueueMinutes.transcription}
            fileName={viewingQueueMinutes.fileName}
            templatePrompt={activeTemplatePrompt ?? undefined}
            audioFile={audioPlayerEnabled ? viewingQueueMinutes.audioFile : undefined}
            segments={audioPlayerEnabled ? viewingQueueMinutes.segments : undefined}
            onReset={() => {
              viewingQueueMinutes.onClose()
              setViewingQueueMinutes(null)
            }}
            onReanalyze={() => {
              viewingQueueMinutes.onReanalyze()
              setViewingQueueMinutes(null)
            }}
            onMinutesChange={m => setViewingQueueMinutes(prev => prev ? { ...prev, minutes: m } : prev)}
          />
        )}
      </main>

      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      {statsOpen && <StatsPanel onClose={() => setStatsOpen(false)} />}

      {/* 設定パネル */}
      {settingsOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSettingsOpen(false)} />
          <aside className="fixed right-0 top-0 h-full w-80 bg-sand-100 dark:bg-sand-900 z-50 shadow-2xl flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-4 border-b-2 border-sand-300 dark:border-sand-700 bg-sand-200/60 dark:bg-sand-800/60">
              <h2 className="font-semibold text-sand-800 dark:text-sand-200">設定</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-1 rounded hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-500"
                aria-label="閉じる"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-4 flex flex-col gap-4">
              <p className="text-xs font-semibold text-sand-400 uppercase tracking-wider">設定</p>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-sand-400 uppercase tracking-wider">議事録テンプレート</p>
                <select
                  value={activeTemplateId ?? ''}
                  onChange={e => selectTemplate(e.target.value || null)}
                  className="w-full text-xs rounded-md border border-sand-300 dark:border-sand-600 bg-sand-50 dark:bg-sand-800 text-sand-700 dark:text-sand-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">デフォルト</option>
                  <optgroup label="プリセット">
                    {PRESET_TEMPLATES.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                  {templates.length > 0 && (
                    <optgroup label="カスタム">
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {templates.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-sand-600 dark:text-sand-400 bg-sand-100 dark:bg-sand-800 rounded px-2 py-1">
                    <span className="truncate">{t.name}</span>
                    <button onClick={() => deleteTemplate(t.id)} className="text-sand-400 hover:text-red-400 ml-2 shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {showTemplateForm ? (
                  <div className="flex flex-col gap-2 p-2 rounded-md border border-sand-300 dark:border-sand-600 bg-sand-50 dark:bg-sand-800">
                    <input
                      type="text"
                      placeholder="テンプレート名"
                      value={newTemplateName}
                      onChange={e => setNewTemplateName(e.target.value)}
                      className="text-xs rounded border border-sand-300 dark:border-sand-600 bg-white dark:bg-sand-900 text-sand-700 dark:text-sand-300 px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <textarea
                      placeholder={`プロンプトを入力...\n\nデフォルト:\n${DEFAULT_SYSTEM_PROMPT.slice(0, 80)}...`}
                      value={newTemplatePrompt}
                      onChange={e => setNewTemplatePrompt(e.target.value)}
                      rows={6}
                      className="text-xs rounded border border-sand-300 dark:border-sand-600 bg-white dark:bg-sand-900 text-sand-700 dark:text-sand-300 px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono"
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setNewTemplatePrompt(DEFAULT_SYSTEM_PROMPT)}
                        className="text-xs px-2 py-1 rounded border border-sand-300 dark:border-sand-600 text-sand-600 dark:text-sand-400 hover:bg-sand-100 dark:hover:bg-sand-700"
                      >
                        デフォルトをコピー
                      </button>
                      <button onClick={addTemplate} className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 ml-auto">保存</button>
                      <button onClick={() => setShowTemplateForm(false)} className="text-xs px-2 py-1 rounded border border-sand-300 dark:border-sand-600 text-sand-600 dark:text-sand-400 hover:bg-sand-100">キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTemplateForm(true)}
                    className="text-xs px-2 py-1 rounded border border-sand-300 dark:border-sand-600 text-sand-600 dark:text-sand-400 hover:bg-sand-100 dark:hover:bg-sand-800 self-start"
                  >
                    + 新規作成
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-sand-400 uppercase tracking-wider">Whisperモデル</p>
                <select
                  value={whisperModel}
                  onChange={e => { setWhisperModel(e.target.value); localStorage.setItem('whisperModel', e.target.value) }}
                  className="w-full text-xs rounded-md border border-sand-300 dark:border-sand-600 bg-sand-50 dark:bg-sand-800 text-sand-700 dark:text-sand-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="large-v3">large-v3（最高精度・低速）</option>
                  <option value="medium">medium（バランス）</option>
                  <option value="small">small（高速）</option>
                  <option value="base">base（最高速）</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-sand-400 uppercase tracking-wider">音声プレイヤー</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={audioPlayerEnabled}
                    onChange={e => { setAudioPlayerEnabled(e.target.checked); localStorage.setItem('audioPlayerEnabled', String(e.target.checked)) }}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-xs text-sand-600 dark:text-sand-400">処理完了後に音声プレイヤーを表示する</span>
                </label>
                <p className="text-xs text-sand-400">※ 処理完了直後のキュー表示時のみ再生できます（履歴からは不可）</p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-sand-400 uppercase tracking-wider">話者分離</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={defaultDiarize}
                    onChange={e => { setDefaultDiarize(e.target.checked); localStorage.setItem('defaultDiarize', String(e.target.checked)) }}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-xs text-sand-600 dark:text-sand-400">デフォルトで話者分離を有効にする</span>
                </label>
                <p className="text-xs text-sand-400">※ simple-diarizer のインストールが必要です</p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-sand-400 uppercase tracking-wider">処理禁止時間帯</p>
                {blackoutPeriods.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {blackoutPeriods.map(p => (
                      <li key={p.id} className="flex items-center justify-between text-sm text-sand-700 dark:text-sand-300 bg-sand-100 dark:bg-sand-800 rounded-md px-3 py-1.5">
                        <span>{p.start} 〜 {p.end}</span>
                        <button
                          onClick={() => removeBlackoutPeriod(p.id)}
                          className="text-sand-400 hover:text-red-400 ml-2"
                          aria-label="削除"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-1">
                  <input
                    type="time"
                    value={newBlackoutStart}
                    onChange={e => setNewBlackoutStart(e.target.value)}
                    className="flex-1 text-xs rounded border border-sand-300 dark:border-sand-600 bg-sand-50 dark:bg-sand-800 text-sand-700 dark:text-sand-300 px-2 py-1"
                  />
                  <span className="text-xs text-sand-400">〜</span>
                  <input
                    type="time"
                    value={newBlackoutEnd}
                    onChange={e => setNewBlackoutEnd(e.target.value)}
                    className="flex-1 text-xs rounded border border-sand-300 dark:border-sand-600 bg-sand-50 dark:bg-sand-800 text-sand-700 dark:text-sand-300 px-2 py-1"
                  />
                  <button
                    onClick={addBlackoutPeriod}
                    className="shrink-0 text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
                  >
                    追加
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* 履歴パネル */}
      {historyOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setHistoryOpen(false)} />
          <aside className="fixed right-0 top-0 h-full w-80 bg-sand-100 dark:bg-sand-900 z-50 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b-2 border-sand-300 dark:border-sand-700 bg-sand-200/60 dark:bg-sand-800/60">
              <h2 className="font-semibold text-sand-800 dark:text-sand-200">履歴</h2>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-1 rounded hover:bg-sand-100 dark:hover:bg-sand-800 text-sand-500"
                aria-label="閉じる"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              <input
                type="search"
                placeholder="ファイル名で検索..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full text-sm rounded-md border border-sand-300 dark:border-sand-600 bg-sand-50 dark:bg-sand-800 text-sand-700 dark:text-sand-300 placeholder-sand-400 px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
              />
              <select
                value={historySort}
                onChange={e => setHistorySort(e.target.value as typeof historySort)}
                className="w-full text-xs rounded-md border border-sand-300 dark:border-sand-600 bg-sand-50 dark:bg-sand-800 text-sand-600 dark:text-sand-400 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="date-desc">日付（新しい順）</option>
                <option value="date-asc">日付（古い順）</option>
                <option value="name-asc">名前（昇順）</option>
                <option value="name-desc">名前（降順）</option>
              </select>
              {historyLoading ? (
                <p className="text-sm text-sand-400">読み込み中...</p>
              ) : filteredHistory.length === 0 ? (
                <p className="text-sm text-sand-400">{historySearch ? '一致する履歴がありません' : '履歴がありません'}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {filteredHistory.map(item => (
                    <li
                      key={item.id}
                      onClick={() => handleSelectHistory(item.id)}
                      className="flex items-start justify-between gap-2 p-3 rounded-lg cursor-pointer hover:bg-sand-100 dark:hover:bg-sand-800 group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-sand-800 dark:text-sand-200 truncate">
                          {item.fileName.replace(/\.(mp3|m4a)$/i, '')}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-sand-400">{formatDate(item.createdAt)}</p>
                          {item.whisperModel && (
                            <span className="text-xs font-mono text-sand-400">{item.whisperModel}</span>
                          )}
                          {item.duration !== undefined && (
                            <span className="text-xs text-sand-400">
                              {item.duration >= 60
                                ? `${Math.floor(item.duration / 60)}分${item.duration % 60}秒`
                                : `${item.duration}秒`}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400"
                        aria-label="削除"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
