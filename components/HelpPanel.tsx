'use client'

interface HelpPanelProps {
  onClose: () => void
}

interface Section {
  title: string
  items: { label: string; desc: string }[]
}

const STEPS = [
  { step: '1', text: '音声ファイル（mp3 / m4a）をドラッグ＆ドロップ、またはクリックして選択' },
  { step: '2', text: 'Whisperが文字起こしを行います（large-v3で最高精度）' },
  { step: '3', text: 'Gemini 2.5 Flashが文字起こしから議事録を生成します' },
  { step: '4', text: '議事録・文字起こしをコピー・ダウンロード・PDF保存できます' },
]

const SECTIONS: Section[] = [
  {
    title: 'キュー機能',
    items: [
      { label: '複数ファイル同時登録', desc: '複数の音声ファイルを一度に追加し、自動で順番に処理します。' },
      { label: 'キャンセル・再開', desc: '処理中のファイルはキャンセルでき、キャンセル済みは再開できます。' },
      { label: 'ファイルごとのモデル設定', desc: '待機中のファイルはWhisperモデルと話者分離を個別に変更できます。' },
    ],
  },
  {
    title: '精度向上',
    items: [
      { label: '講義資料のアップロード', desc: 'PDF または .txt の講義資料をキューエリアにアップロードすると、Geminiが資料を参照して専門用語を正確に反映した議事録を生成します。' },
      { label: 'ハルシネーション自動検知', desc: 'Whisperが誤認識（定型文ループ・極端に短い出力）を自動検知し、精度優先設定で再解析します。' },
      { label: 'ハルシネーション手動再解析', desc: '議事録画面のオレンジ色ボタンを押すと、強制的に精度優先設定で再解析を実行します。' },
    ],
  },
  {
    title: 'Whisperモデル',
    items: [
      { label: 'large-v3', desc: '最高精度・低速。GPU推奨。デフォルト。' },
      { label: 'medium', desc: '精度と速度のバランス型。' },
      { label: 'small', desc: '高速。短い音声に向いています。' },
      { label: 'base', desc: '最速。精度は低めですが素早く確認したい場合に。' },
    ],
  },
  {
    title: '話者分離',
    items: [
      { label: 'speaker diarization', desc: '複数人の会話を「話者A」「話者B」のようにラベル付けして文字起こしします。simple-diarizer（MIT）の別途インストールが必要です。' },
    ],
  },
  {
    title: 'テンプレート',
    items: [
      { label: '講義用プリセット', desc: '授業内容のまとめ・重要用語・補足事項を抽出するフォーマット。' },
      { label: '会議用プリセット', desc: '決定事項・アクションアイテム・議論の要約に特化したフォーマット。' },
      { label: 'カスタムテンプレート', desc: '設定 → 議事録テンプレート から独自のプロンプトを作成・保存できます。' },
    ],
  },
  {
    title: '議事録の編集・再生成',
    items: [
      { label: 'インライン編集', desc: '議事録タブの「編集」ボタンを押すと、生成されたMarkdownをその場で直接編集できます。「保存」で確定し、コピーやダウンロードにも反映されます。' },
      { label: '全文再生成', desc: '議事録タブの「再生成」ボタンを押すと、保存済みの文字起こし全体から議事録を作り直します。テンプレートを変えて再生成する場合に便利です。' },
      { label: '部分指定再生成', desc: 'タイムスタンプ付きの文字起こしがある場合、再生成パネルで「部分指定」モードに切り替えると、行ごとにチェックボックスで選択した箇所だけを使って議事録を再生成できます。特定のトピックだけ抽出したいときに使います。' },
    ],
  },
  {
    title: '音声プレイヤー・同期ハイライト',
    items: [
      { label: '音声プレイヤー', desc: '設定の「音声プレイヤーを表示する」をONにすると、処理完了後に文字起こしタブへ再生バーが表示されます。処理完了直後のキュー表示時のみ利用できます（履歴からは不可）。' },
      { label: '再生同期ハイライト', desc: '音声を再生すると、現在読まれている箇所の文字起こし行が黄色くハイライトされます。行をクリックするとその位置から再生できます。' },
    ],
  },
  {
    title: 'その他の機能',
    items: [
      { label: 'ブラウザ通知', desc: '処理完了または失敗時にブラウザ通知を受け取れます。初回ファイル追加時に許可を求めます。' },
      { label: 'PDF エクスポート', desc: '議事録画面の「PDF」ボタンを押すと、ブラウザの印刷ダイアログからPDF保存できます。' },
      { label: '処理禁止時間帯', desc: '設定で時間帯を指定すると、その間は処理を一時停止します（深夜にGPUを使わないなど）。' },
      { label: '処理統計', desc: 'ヘッダーの棒グラフアイコンから、月別処理件数・モデル別の平均処理時間・累計処理時間を確認できます。' },
      { label: '一括エクスポート', desc: '統計パネル下部のボタンから全履歴をZIPでダウンロードできます。議事録・文字起こし・全データJSONを含みます。' },
      { label: '履歴', desc: '生成した議事録と文字起こしは自動で保存されます。ヘッダーの時計アイコンから検索・閲覧できます。' },
    ],
  },
]

export default function HelpPanel({ onClose }: HelpPanelProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl max-h-[90vh] flex flex-col bg-sand-50 dark:bg-sand-900 rounded-xl shadow-2xl border border-sand-200 dark:border-sand-700 overflow-hidden">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-sand-200 dark:border-sand-700 bg-sand-100/60 dark:bg-sand-800/60 shrink-0">
            <div>
              <h2 className="font-semibold text-sand-800 dark:text-sand-200 text-base">使い方ガイド</h2>
              <p className="text-xs text-sand-400 mt-0.5">講義議事録ジェネレーターの全機能</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-sand-200 dark:hover:bg-sand-700 text-sand-500"
              aria-label="閉じる"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* コンテンツ */}
          <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-6">
            {/* 基本の流れ */}
            <section>
              <h3 className="text-xs font-semibold text-sand-400 uppercase tracking-wider mb-3">基本の流れ</h3>
              <ol className="flex flex-col gap-2">
                {STEPS.map(s => (
                  <li key={s.step} className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {s.step}
                    </span>
                    <p className="text-sm text-sand-700 dark:text-sand-300 leading-relaxed">{s.text}</p>
                  </li>
                ))}
              </ol>
            </section>

            <div className="border-t border-sand-200 dark:border-sand-700" />

            {/* 機能セクション */}
            {SECTIONS.map(sec => (
              <section key={sec.title}>
                <h3 className="text-xs font-semibold text-sand-400 uppercase tracking-wider mb-3">{sec.title}</h3>
                <dl className="flex flex-col gap-2.5">
                  {sec.items.map(item => (
                    <div key={item.label} className="flex flex-col gap-0.5">
                      <dt className="text-sm font-medium text-sand-800 dark:text-sand-200">{item.label}</dt>
                      <dd className="text-sm text-sand-500 dark:text-sand-400 leading-relaxed">{item.desc}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
