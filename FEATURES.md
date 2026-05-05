# 講義議事録ジェネレーター — 開発まとめ

## 何を作ったか

音声ファイル（mp3/m4a）をアップロードすると、**Whisper で文字起こし → Gemini で議事録に整形**するローカル動作のWebアプリ。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 16.2.4 (App Router) |
| スタイル | Tailwind CSS v4（カスタムベージュパレット） |
| 文字起こし | openai-whisper large-v3（GPU：RTX 5070） |
| 議事録生成 | Gemini 2.5 Flash API |
| 話者分離 | simple-diarizer（CPU、MIT） |
| ランタイム | Python 3 + PyTorch nightly cu128 |
| データ保存 | JSONファイル + localStorage |

---

## 実装済み機能

### コア機能
- **音声ファイルキュー処理** — 複数ファイルを一括追加し順次処理
- **SSEストリーミング** — Whisperの進捗（%）をリアルタイムで表示
- **議事録生成** — Gemini 2.5 Flash でMarkdown形式に整形
- **自動保存** — 処理完了時に履歴へ自動保存

### 表示・出力
- **議事録 / 文字起こし タブ切り替え** — Markdownレンダリング vs タイムスタンプ付き素起こし
- **インライン編集** — 議事録をアプリ内で直接編集・保存。コピーやダウンロードに即時反映
- **PDFエクスポート** — `window.print()` + 印刷用CSS（ライブラリ不要）
- **Markdownダウンロード / テキストダウンロード**
- **コピー** — HTML形式とプレーンテキスト両対応（Googleドキュメントに書式付きで貼り付け可）
- **ボタンツールチップ** — 各ボタンにカーソルを合わせると機能の説明が表示（Tailwind group-hover）

### キュー管理
- **停止・再解析** — 処理中に `AbortController` でキャンセル可能
- **処理禁止時間帯** — 設定した時間帯は処理を自動待機
- **ブラウザ通知** — 処理完了時にデスクトップ通知（Notification API、無料）

### 精度向上
- **講義資料アップロード** — PDF/txtをGeminiに渡して専門用語・構成を補正
- **話者分離** — simple-diarizer で `[00:01] 話者A: ...` 形式で出力（商用利用OK）
- **話者名のリネーム** — 文字起こしタブの「話者名を変更」から話者A→実名に一括変換。議事録・文字起こし両方に反映
- **ハルシネーション自動検知** — 定型文フレーズ・出力長・無音確率で誤認識を検知し精度優先設定で自動再試行
- **ハルシネーション手動再解析** — 議事録画面のオレンジ色ボタンで強制的に精度優先再解析
- **キーワードセクション** — 議事録末尾に用語集を自動生成
- **モデルダウンロード進捗表示** — 初回のみ `~/.cache/whisper/` へダウンロードが走る際、進捗バーと「モデルをダウンロード中（初回のみ）」を表示

### 再生成
- **全文再生成** — 保存済みの文字起こし全体から議事録を再生成。テンプレート変更後にWhisperを走らせ直す手間なし
- **部分指定再生成** — タイムスタンプ付き文字起こしをセグメント単位でチェックボックス選択し、選んだ行だけで再生成

### カスタマイズ
- **Whisperモデル切り替え** — large-v3 / medium / small / base（グローバル＋ファイルごと）
- **テンプレート機能** — Geminiへのプロンプトを用途別に保存・切り替え
  - プリセット：「講義用」「会議用」
  - カスタム：自由に作成・保存可能
- **履歴の検索・ソート** — ファイル名検索、日付・名前順ソート

### 計測・記録
- **処理時間の記録** — 完了アイテムと履歴一覧に表示
- **使用モデルの記録** — 履歴にWhisperモデル名を保存
- **処理統計** — ヘッダーの棒グラフアイコンから閲覧。月別件数グラフ（直近6ヶ月）・Whisperモデル別の処理件数と平均時間・累計処理時間

### 音声プレイヤー・同期ハイライト
- **音声プレイヤー** — 設定でONにすると処理完了後の文字起こしタブに `<audio>` プレイヤーを表示（処理完了直後のキュー表示時のみ・履歴からは不可）
- **再生同期ハイライト** — 再生位置に合わせて対応する文字起こし行を黄色くハイライト。行クリックでその位置から再生できる
- **任意表示** — 設定パネルのトグルでON/OFFを切り替え可能（デフォルトOFF）

### バックアップ
- **一括エクスポート（ZIP）** — 統計パネル下部のボタンから全履歴を一括ダウンロード。`minutes/*.md`・`transcriptions/*.txt`・`history.json` を含むZIPファイルを生成

### ヘルプ
- **使い方ガイド** — ヘッダーの `?` ボタンからモーダルで全機能を説明（基本の流れ・各機能の詳細）

---

## 処理フロー

```
音声ファイル選択（+ 講義資料・モデル・テンプレート選択）
    ↓
POST /api/transcribe（SSE）
  Python: Whisper文字起こし → 進捗をJSON行でstdout出力
  ハルシネーション自動検知 → 精度優先設定で自動再試行
  オプション: simple-diarizer で話者ラベル付与
    ↓
POST /api/summarize
  Gemini 2.5 Flash（カスタムテンプレート対応）
  講義資料がある場合はPDF/テキストをinlineDataで同時送信
    ↓
議事録・文字起こしを表示
  自動保存 → data/history/*.json
  ブラウザ通知
  ↓（オプション）
インライン編集 / 部分指定再生成 / ハルシネーション手動再解析
```

---

## ディレクトリ構成

```
lecture-minutes/
├── app/
│   ├── api/
│   │   ├── transcribe/route.ts   # Whisper SSEストリーミング
│   │   ├── summarize/route.ts    # Gemini議事録生成
│   │   ├── stats/route.ts        # 処理統計API
│   │   └── history/              # 履歴CRUD + export（ZIP）
│   ├── globals.css               # ベージュテーマ + 印刷用CSS
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── AppShell.tsx              # メインUI・設定パネル・履歴パネル
│   ├── QueueManager.tsx          # ファイルキュー・処理制御
│   ├── MinutesViewer.tsx         # 議事録・文字起こし表示・インライン編集
│   ├── RegeneratePanel.tsx       # 全文／部分指定再生成パネル
│   ├── SpeakerRenamePanel.tsx    # 話者名リネームパネル
│   ├── StatsPanel.tsx            # 処理統計・一括エクスポート
│   └── HelpPanel.tsx             # 使い方ガイドモーダル
├── lib/
│   ├── claude.ts                 # Gemini API呼び出し
│   ├── prompts.ts                # プロンプト定数・プリセットテンプレート
│   └── history.ts                # JSONファイルベースの履歴管理
├── whisper/
│   └── transcribe.py             # Whisper + ハルシネーション検知 + simple-diarizer
├── data/history/                 # 議事録JSONファイル（自動生成）
├── 起動.bat                      # プロダクションビルド起動
└── .env.local                    # GOOGLE_API_KEY
```

---

## 設計上の工夫

**QueueManager を常時マウント**
MinutesViewer 表示中もキュー状態を保持するため、`hidden` CSSクラスで切り替え。`unmount` するとキューが消える問題を回避。

**stale closure 対策**
`onSaveHistory` などの非同期コールバックは `useRef` でラップして常に最新の関数を参照。

**SSEストリーミング**
Python → stdout（JSON行）→ Node.js → SSE → ブラウザ の流れ。`tqdm` をパッチしてWhisperの進捗をリアルタイム取得。

**ハルシネーション検知の設計**
精度優先設定（`condition_on_previous_text=False` など）は通常時は使わず、検知時・手動指示時のみ適用。通常時の精度を落とさずにフォールバックとして機能させる。

**Windows対応**
`sys.stdout.reconfigure(encoding='utf-8')` でcp932文字化けを防止。`.venv` のPythonを明示指定でCUDAライブラリを確実に読み込む。

---

## ライセンスと商用利用

| コンポーネント | ライセンス | 商用 |
|---|---|---|
| Next.js | MIT | ✓ |
| openai-whisper | MIT | ✓ |
| simple-diarizer / resemblyzer | MIT | ✓ |
| PyTorch | BSD | ✓ |
| Gemini API | Google利用規約 | ✓（課金あり） |

> pyannote.audio の学習済みモデルは非商用限定なので、商用目的では simple-diarizer を選択。

---

## セットアップ

```bash
# 依存インストール
npm install

# Python仮想環境
python -m venv .venv
.venv\Scripts\activate
pip install openai-whisper
pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128
pip install simple-diarizer  # 話者分離を使う場合

# ビルド＆起動
npm run build
# → 起動.bat をダブルクリック
```

---

## 今後の拡張候補

### 優先度低
- **Google Drive への自動保存（ドキュメント）**
- **複数ユーザー対応（認証）**
