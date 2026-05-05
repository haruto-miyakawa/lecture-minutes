'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import RegeneratePanel from './RegeneratePanel'
import SpeakerRenamePanel, { detectSpeakers } from './SpeakerRenamePanel'
import type { Segment } from './QueueManager'

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface MinutesViewerProps {
  minutes: string
  transcription?: string
  fileName?: string
  templatePrompt?: string
  audioFile?: File
  segments?: Segment[]
  onReset: () => void
  onSave?: () => Promise<void>
  onReanalyze?: () => void
  onMinutesChange?: (minutes: string) => void
}

function Tooltip({ children, text, align = 'center' }: {
  children: React.ReactNode
  text: string
  align?: 'center' | 'right'
}) {
  return (
    <div className="relative group/tip">
      {children}
      <div className={`absolute bottom-full mb-2 px-2.5 py-1.5 text-xs text-white bg-sand-800 dark:bg-sand-700 rounded-md opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50 shadow-md w-max max-w-[220px] whitespace-normal leading-snug
        ${align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
      >
        {text}
        <div className={`absolute top-full border-[5px] border-transparent border-t-sand-800 dark:border-t-sand-700
          ${align === 'right' ? 'right-3' : 'left-1/2 -translate-x-1/2'}`}
        />
      </div>
    </div>
  )
}

export default function MinutesViewer({
  minutes,
  transcription,
  fileName,
  templatePrompt,
  audioFile,
  segments,
  onReset,
  onSave,
  onReanalyze,
  onMinutesChange,
}: MinutesViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const activeSegmentRef = useRef<HTMLDivElement>(null)
  const [localMinutes, setLocalMinutes] = useState(minutes)
  const [localTranscription, setLocalTranscription] = useState(transcription ?? '')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'minutes' | 'transcription'>('minutes')
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(minutes)
  const [showRegenPanel, setShowRegenPanel] = useState(false)
  const [showRenamePanel, setShowRenamePanel] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [activeSegmentIdx, setActiveSegmentIdx] = useState(-1)

  const hasSpeakers = detectSpeakers(localTranscription).length > 0

  // props が変わったとき（再解析後など）にローカル状態を同期
  useEffect(() => {
    setLocalMinutes(minutes)
    setEditDraft(minutes)
    setIsEditing(false)
    setShowRegenPanel(false)
  }, [minutes])

  useEffect(() => {
    setLocalTranscription(transcription ?? '')
    setShowRenamePanel(false)
  }, [transcription])

  useEffect(() => {
    if (!audioFile) return
    const url = URL.createObjectURL(audioFile)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [audioFile])

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current || !segments?.length) return
    const t = audioRef.current.currentTime
    const idx = segments.reduce((best, seg, i) => seg.start <= t ? i : best, -1)
    setActiveSegmentIdx(prev => prev !== idx ? idx : prev)
  }, [segments])

  function seekTo(seconds: number) {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    void audioRef.current.play()
  }

  function handleEditStart() {
    setEditDraft(localMinutes)
    setIsEditing(true)
    setShowRegenPanel(false)
  }

  function handleEditSave() {
    setLocalMinutes(editDraft)
    onMinutesChange?.(editDraft)
    setIsEditing(false)
  }

  function handleEditCancel() {
    setIsEditing(false)
  }

  function handleRegenResult(newMinutes: string) {
    setLocalMinutes(newMinutes)
    onMinutesChange?.(newMinutes)
    setShowRegenPanel(false)
  }

  async function handleSave() {
    if (!onSave) return
    await onSave()
    setSaved(true)
  }

  async function handleCopy() {
    if (!contentRef.current) return
    const html = contentRef.current.innerHTML
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html':  new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([localMinutes], { type: 'text/plain' }),
      }),
    ])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCopyTranscription() {
    if (!localTranscription) return
    await navigator.clipboard.writeText(localTranscription)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const baseName = fileName?.replace(/\.(mp3|m4a)$/i, '') ?? 'lecture-minutes'
    const blob = new Blob([localMinutes], { type: 'text/markdown; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}-議事録.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleDownloadTranscription() {
    if (!localTranscription) return
    const baseName = fileName?.replace(/\.(mp3|m4a)$/i, '') ?? 'lecture-minutes'
    const blob = new Blob([localTranscription], { type: 'text/plain; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}-文字起こし.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* タブ + アクションバー */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          {transcription ? (
            <>
              <button
                onClick={() => { setActiveTab('minutes'); setIsEditing(false) }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'minutes' ? 'bg-sand-200 dark:bg-sand-700 text-sand-900 dark:text-sand-100' : 'text-sand-500 hover:text-sand-700 dark:hover:text-sand-300'}`}
              >
                議事録
              </button>
              <button
                onClick={() => { setActiveTab('transcription'); setIsEditing(false) }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'transcription' ? 'bg-sand-200 dark:bg-sand-700 text-sand-900 dark:text-sand-100' : 'text-sand-500 hover:text-sand-700 dark:hover:text-sand-300'}`}
              >
                文字起こし
              </button>
            </>
          ) : (
            <h2 className="text-lg font-semibold text-sand-800 dark:text-sand-200">議事録</h2>
          )}
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          {/* 議事録タブ専用ボタン */}
          {activeTab === 'minutes' && (
            <>
              {/* インライン編集 */}
              {isEditing ? (
                <>
                  <Tooltip text="編集内容を確定します。コピーやダウンロードにも反映されます。">
                    <button
                      onClick={handleEditSave}
                      className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      保存
                    </button>
                  </Tooltip>
                  <button
                    onClick={handleEditCancel}
                    className="flex items-center gap-1.5 rounded-md border border-sand-300 dark:border-sand-600 px-3 py-1.5 text-sm text-sand-700 dark:text-sand-300 hover:bg-sand-100 dark:hover:bg-sand-800"
                  >
                    キャンセル
                  </button>
                </>
              ) : (
                <Tooltip text="Markdownを直接編集できます。保存すると、コピーやダウンロードにも反映されます。">
                  <button
                    onClick={handleEditStart}
                    className="flex items-center gap-1.5 rounded-md border border-sand-300 dark:border-sand-600 px-3 py-1.5 text-sm text-sand-700 dark:text-sand-300 hover:bg-sand-100 dark:hover:bg-sand-800"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    編集
                  </button>
                </Tooltip>
              )}

              {/* 文字起こしから再生成（transcription がある場合のみ） */}
              {transcription && !isEditing && (
                <Tooltip text="保存済みの文字起こしから議事録を再生成します。部分指定モードでは選択した行だけを使えます。">
                  <button
                    onClick={() => setShowRegenPanel(v => !v)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      showRegenPanel
                        ? 'bg-sand-200 dark:bg-sand-700 border-sand-400 dark:border-sand-500 text-sand-800 dark:text-sand-200'
                        : 'border-sand-300 dark:border-sand-600 text-sand-700 dark:text-sand-300 hover:bg-sand-100 dark:hover:bg-sand-800'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    再生成
                  </button>
                </Tooltip>
              )}
            </>
          )}

          {/* 文字起こしタブ専用ボタン */}
          {activeTab === 'transcription' && hasSpeakers && (
            <Tooltip text="話者A・話者Bなどのラベルを実名に一括変換します。議事録・文字起こし両方に反映されます。">
              <button
                onClick={() => setShowRenamePanel(v => !v)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  showRenamePanel
                    ? 'bg-purple-100 dark:bg-purple-950/40 border-purple-400 dark:border-purple-600 text-purple-700 dark:text-purple-300'
                    : 'border-sand-300 dark:border-sand-600 text-sand-700 dark:text-sand-300 hover:bg-sand-100 dark:hover:bg-sand-800'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                話者名を変更
              </button>
            </Tooltip>
          )}

          {/* 共通ボタン */}
          {onSave && (
            <button
              onClick={handleSave}
              disabled={saved}
              className="flex items-center gap-1.5 rounded-md border border-sand-300 dark:border-sand-600 px-3 py-1.5 text-sm text-sand-700 dark:text-sand-300 hover:bg-sand-100 dark:hover:bg-sand-800 disabled:opacity-50"
            >
              {saved ? '保存済み' : '保存'}
            </button>
          )}

          <Tooltip text={activeTab === 'minutes' ? 'Googleドキュメントなどに書式付きで貼り付けできます' : '文字起こしテキストをコピーします'}>
            <button
              onClick={activeTab === 'minutes' ? handleCopy : handleCopyTranscription}
              className="flex items-center gap-1.5 rounded-md border border-sand-300 dark:border-sand-600 px-3 py-1.5 text-sm text-sand-700 dark:text-sand-300 hover:bg-sand-100 dark:hover:bg-sand-800"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  コピー済み
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  コピー
                </>
              )}
            </button>
          </Tooltip>

          {activeTab === 'minutes' ? (
            <>
              <Tooltip text="印刷ダイアログを開きます。「PDFとして保存」を選択するとPDFに出力できます。">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-md border border-sand-300 dark:border-sand-600 px-3 py-1.5 text-sm text-sand-700 dark:text-sand-300 hover:bg-sand-100 dark:hover:bg-sand-800"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  PDF
                </button>
              </Tooltip>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                .mdダウンロード
              </button>
            </>
          ) : (
            <button
              onClick={handleDownloadTranscription}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              .txtダウンロード
            </button>
          )}

          {onReanalyze && (
            <Tooltip align="right" text="「本日はご覧いただき…」など明らかな誤認識を検知した場合に使います。精度優先の設定でWhisper解析をやり直します。">
              <button
                onClick={onReanalyze}
                className="flex items-center gap-1.5 rounded-md border border-orange-300 dark:border-orange-700 px-3 py-1.5 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                ハルシネーション再解析
              </button>
            </Tooltip>
          )}

          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-md border border-sand-300 dark:border-sand-600 px-3 py-1.5 text-sm text-sand-700 dark:text-sand-300 hover:bg-sand-100 dark:hover:bg-sand-800"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            ホームに戻る
          </button>
        </div>
      </div>

      {/* 再生成パネル（議事録タブ） */}
      {showRegenPanel && localTranscription && (
        <RegeneratePanel
          transcription={localTranscription}
          templatePrompt={templatePrompt}
          onResult={handleRegenResult}
          onClose={() => setShowRegenPanel(false)}
        />
      )}

      {/* 話者リネームパネル（文字起こしタブ） */}
      {showRenamePanel && localTranscription && (
        <SpeakerRenamePanel
          transcription={localTranscription}
          minutes={localMinutes}
          onApply={(newTranscription, newMinutes) => {
            setLocalTranscription(newTranscription)
            setLocalMinutes(newMinutes)
            onMinutesChange?.(newMinutes)
            setShowRenamePanel(false)
          }}
          onClose={() => setShowRenamePanel(false)}
        />
      )}

      {/* コンテンツ */}
      {activeTab === 'minutes' ? (
        isEditing ? (
          <textarea
            value={editDraft}
            onChange={e => setEditDraft(e.target.value)}
            className="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-sand-900 p-6 text-sm text-sand-700 dark:text-sand-300 leading-relaxed font-mono resize-none outline-none focus:ring-2 focus:ring-blue-400 min-h-[60vh]"
            spellCheck={false}
          />
        ) : (
          <div ref={contentRef} className="print-area w-full rounded-lg border border-sand-200 dark:border-sand-700 bg-sand-50 dark:bg-sand-900 p-6 overflow-auto max-h-[70vh] prose prose-stone dark:prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mt-6 mb-3 text-sand-900 dark:text-sand-100">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mt-5 mb-2 text-sand-800 dark:text-sand-200">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-1.5 text-sand-800 dark:text-sand-200">{children}</h3>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-sm text-sand-700 dark:text-sand-300">{children}</li>,
                p:  ({ children }) => <p className="text-sm leading-relaxed text-sand-700 dark:text-sand-300 my-1.5">{children}</p>,
                strong: ({ children }) => <strong className="font-bold text-sand-900 dark:text-sand-100">{children}</strong>,
              }}
            >
              {localMinutes}
            </ReactMarkdown>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {/* 音声プレイヤー（audioFile がある場合のみ） */}
          {audioUrl && (
            <div className="rounded-lg border border-sand-200 dark:border-sand-700 bg-sand-50 dark:bg-sand-900 px-4 py-3">
              <p className="text-xs text-sand-400 mb-2">音声プレイヤー（このセッション中のみ再生できます）</p>
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                onTimeUpdate={handleTimeUpdate}
                className="w-full h-10"
              />
            </div>
          )}

          <div className="w-full rounded-lg border border-sand-200 dark:border-sand-700 bg-sand-50 dark:bg-sand-900 overflow-auto max-h-[65vh]">
            {/* セグメントデータがある場合: クリックでシーク可能なリスト表示 */}
            {segments && segments.length > 0 ? (
              <div className="flex flex-col p-2">
                {segments.map((seg, i) => (
                  <div
                    key={i}
                    ref={i === activeSegmentIdx ? activeSegmentRef : undefined}
                    onClick={() => seekTo(seg.start)}
                    className={`flex items-start gap-2 px-3 py-1.5 rounded-md transition-colors ${
                      audioUrl ? 'cursor-pointer' : ''
                    } ${
                      i === activeSegmentIdx
                        ? 'bg-yellow-100 dark:bg-yellow-900/40'
                        : audioUrl ? 'hover:bg-sand-100 dark:hover:bg-sand-800' : ''
                    }`}
                  >
                    <span className="font-mono text-xs text-sand-400 shrink-0 mt-0.5 w-12">[{fmtTime(seg.start)}]</span>
                    <span className="text-sm text-sand-700 dark:text-sand-300 leading-relaxed">
                      {seg.speaker && <span className="text-sand-500 mr-1">{seg.speaker}:</span>}
                      {seg.text}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              /* セグメントなし: プレーンテキスト */
              <div className="p-6">
                <pre className="text-sm text-sand-700 dark:text-sand-300 whitespace-pre-wrap leading-relaxed font-sans">
                  {localTranscription}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
