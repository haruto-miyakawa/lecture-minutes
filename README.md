# 講義議事録ジェネレーター

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Python](https://img.shields.io/badge/Python-3.11+-yellow?logo=python)
![License](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey)

音声ファイル（mp3 / m4a）をアップロードするだけで、**Whisper による文字起こし → Gemini による議事録生成**をローカルで完結させる Web アプリ。

---

## 概要

講義や会議の録音を、手作業なしで構造化された議事録に変換します。
**GPU（RTX 5070）を活用した高精度 Whisper large-v3** による文字起こしと、**Gemini 2.5 Flash** による要約・整形を組み合わせ、実用レベルの議事録を自動生成します。処理の進捗は SSE ストリーミングでリアルタイムに表示され、複数ファイルのバッチ処理にも対応しています。

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16.2 (App Router) + TypeScript |
| スタイリング | Tailwind CSS v4（カスタムベージュパレット） |
| 文字起こし | openai-whisper large-v3（CUDA / RTX 5070） |
| 議事録生成 | Gemini 2.5 Flash API |
| 話者分離 | simple-diarizer（MIT、CPU動作） |
| ランタイム | Python 3 + PyTorch nightly cu128 |
| ZIP エクスポート | fflate（ブラウザ側圧縮） |
| データ永続化 | JSON ファイル + localStorage |

---

## 主要機能

### AI 処理
- **Whisper 文字起こし** — large-v3 / medium / small / base をファイルごとに切り替え可能
- **Gemini 議事録生成** — カスタムプロンプトテンプレート対応（講義用・会議用プリセット付き）
- **話者分離** — `[00:01] 話者A: ...` 形式で複数話者をラベル付け
- **ハルシネーション自動検知** — 定型文ループ・出力長・無音確率で誤認識を検知し自動再試行
- **講義資料アップロード** — PDF/txt をコンテキストとして渡し、専門用語の精度を向上

### UI / UX
- **SSE ストリーミング** — Whisper 進捗（%）をリアルタイム表示。モデルダウンロード中も進捗バー表示
- **複数ファイルキュー** — ドラッグ＆ドロップで複数ファイルを登録し順次処理
- **インライン編集** — 議事録を画面内で直接編集・保存
- **部分指定再生成** — タイムスタンプ行をチェックボックスで選択し、指定箇所のみで再生成
- **話者名リネーム** — 「話者A」→ 実名への一括変換
- **音声プレイヤー＋同期ハイライト** — 再生位置に合わせて文字起こし行をハイライト、行クリックでシーク

### 出力・エクスポート
- **Markdown / テキストダウンロード**
- **PDF エクスポート** — `window.print()` + 印刷用 CSS（外部ライブラリ不要）
- **クリップボードコピー** — HTML 形式とプレーンテキスト両対応（Google ドキュメントに書式付きで貼り付け可）
- **一括 ZIP エクスポート** — 全履歴の議事録・文字起こし・JSON を ZIP でダウンロード

### その他
- **処理統計** — 月別件数グラフ・モデル別平均処理時間・累計処理時間
- **処理禁止時間帯** — 設定した時間帯は処理を自動待機
- **ブラウザ通知** — 処理完了時にデスクトップ通知（Notification API）
- **履歴管理** — ファイル名検索・日付/名前ソート

---

## アーキテクチャ

```
音声ファイル選択（+ 講義資料・モデル・テンプレート）
    ↓
POST /api/transcribe（SSE ストリーミング）
  Python: Whisper 文字起こし → 進捗を JSON 行で stdout 出力
  ハルシネーション自動検知 → 精度優先設定で自動再試行
  オプション: simple-diarizer で話者ラベル付与
    ↓
POST /api/summarize
  Gemini 2.5 Flash（カスタムテンプレート対応）
  講義資料がある場合は inlineData で同時送信
    ↓
議事録・文字起こしを表示
  自動保存 → data/history/*.json
  ブラウザ通知
```

**SSE の仕組み**: Python → stdout（JSON 行）→ Node.js → SSE → ブラウザ。`tqdm` をパッチして Whisper の進捗をリアルタイム取得。

---

## ディレクトリ構成

```
lecture-minutes/
├── app/
│   ├── api/
│   │   ├── transcribe/route.ts   # Whisper SSE ストリーミング
│   │   ├── summarize/route.ts    # Gemini 議事録生成
│   │   ├── stats/route.ts        # 処理統計 API
│   │   └── history/              # 履歴 CRUD + ZIP エクスポート
│   ├── globals.css               # ベージュテーマ + 印刷用 CSS
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── AppShell.tsx              # メイン UI・設定・履歴パネル
│   ├── QueueManager.tsx          # ファイルキュー・処理制御
│   ├── MinutesViewer.tsx         # 議事録・文字起こし表示・編集
│   ├── RegeneratePanel.tsx       # 全文／部分指定再生成
│   ├── SpeakerRenamePanel.tsx    # 話者名リネーム
│   ├── StatsPanel.tsx            # 処理統計・一括エクスポート
│   └── HelpPanel.tsx             # 使い方ガイドモーダル
├── lib/
│   ├── claude.ts                 # Gemini API 呼び出し
│   ├── prompts.ts                # プロンプト定数・プリセット
│   └── history.ts                # JSON ファイルベース履歴管理
├── whisper/
│   └── transcribe.py             # Whisper + ハルシネーション検知 + diarization
└── .env.local                    # GOOGLE_API_KEY（要作成）
```

---

## セットアップ

```bash
# Node.js 依存インストール
npm install

# Python 仮想環境
python -m venv .venv
.venv\Scripts\activate
pip install openai-whisper
pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128

# 話者分離を使う場合
pip install simple-diarizer

# 環境変数
echo GOOGLE_API_KEY=your_key_here > .env.local

# ビルド＆起動
npm run build
npm start
```

> **GPU 要件**: CUDA 12.8 対応 GPU 推奨（開発環境: RTX 5070 / sm_120）。CPU でも動作しますが処理速度が大幅に低下します。

---

## ライセンス

[CC BY-NC-ND 4.0](LICENSE) — 参照・閲覧は自由ですが、商用利用・改変・再配布は禁止です。
