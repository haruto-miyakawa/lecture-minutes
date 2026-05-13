# 講義議事録ジェネレーター

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Python](https://img.shields.io/badge/Python-3.11+-yellow?logo=python)
![License](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey)

音声ファイル（mp3 / m4a）をアップロードするだけで、**Whisper による文字起こし → Gemini による議事録生成**をローカルで完結させる Web アプリ。

---

## 解決したい課題 (Motivation)

大学の講義を効率化し、**学習精度を最大化するために開発した**プロダクトです。

既存のクラウド型文字起こしツールには2つの根本的な問題がありました。

1. **コスト**: API 従量課金では長時間講義を毎日処理すると費用がかさみ、学生が継続して使える設計になっていない
2. **ハルシネーション（嘘）**: 専門用語・固有名詞が多い講義では AI が誤った内容を生成し、そのまま試験勉強に使うと逆効果になる

これらを解決するため、**Whisper をローカル実行してゼロコスト化**し、**講義資料を RAG として注入することでハルシネーションを抑制**する仕組みを自作しました。実際の講義で継続使用した結果、小テストで満点を維持できています。

---

## 技術スタック (Tech Stack)

| カテゴリ | 技術 |
|---|---|
| Frontend | Next.js 16.2 (App Router) + TypeScript |
| Styling | Tailwind CSS v4（カスタムカラーパレット） |
| Speech-to-Text | OpenAI Whisper large-v3（ローカル実行・ゼロコスト） |
| LLM | Google Gemini 2.5 Flash API |
| RAG | PDF / テキスト資料を inlineData でコンテキスト注入 |
| Speaker Diarization | simple-diarizer（MIT・CPU動作） |
| Runtime | Python 3 + PyTorch nightly cu128（CUDA 12.8） |
| Streaming | SSE（Server-Sent Events）によるリアルタイム進捗 |
| Export | fflate（ブラウザ側 ZIP 圧縮）、window.print() for PDF |
| Data | JSON ファイル + localStorage |

**Features**: Batch processing / Timestamping / Selective re-analysis / Hallucination detection

---

## 独自の工夫 (Technical Challenges)

### ハルシネーション抑制
講義資料（PDF / テキスト）を Gemini API の `inlineData` として同時送信する RAG 構成を採用。固有名詞・専門用語が多い理系講義でも、資料に基づいた正確な議事録を生成します。

### コスト最適化
Whisper をローカル GPU（RTX 5070 / sm_120）で実行することで **文字起こしコストをゼロ**に。学生が毎日・長期間使い続けられる設計です。PyTorch nightly + CUDA 12.8 対応のため、最新 GPU アーキテクチャ（sm_120）でもフルスピードで動作します。

### 精度保証（部分指定再解析）
タイムスタンプ付きで文字起こしを出力し、怪しい箇所のみをチェックボックスで選択して再解析できる仕組みを実装。全体を再処理するより大幅に短時間で精度を修正できます。

### ハルシネーション自動検知
Whisper の出力を解析し、定型文ループ・無音区間の繰り返し・出力長異常を検知した場合に自動で精度優先設定にフォールバックして再試行します。

### SSE ストリーミング
Python（Whisper 処理中の tqdm）→ stdout（JSON 行）→ Node.js → SSE → ブラウザ という経路でリアルタイム進捗を表示。モデルダウンロード中も進捗バーに反映されます。

---

## 実績 (Achievements)

- **実際の大学講義で継続使用し、小テストで満点を維持**
- **ココナラにて商用版として出品中** → [サービスページ](https://coconala.com/services/4196322?ref=top_histories&ref_kind=home&ref_no=1)

単なる学習用プロジェクトではなく、自分自身が毎日使い、商用展開まで行った**実用プロダクト**です。

---

## 主要機能 (Features)

### AI 処理
- **Whisper 文字起こし** — large-v3 / medium / small / base をファイルごとに切り替え可能
- **Gemini 議事録生成** — カスタムプロンプトテンプレート対応（講義用・会議用プリセット付き）
- **話者分離** — `[00:01] 話者A: ...` 形式で複数話者をラベル付け
- **ハルシネーション自動検知** — 定型文ループ・出力長・無音確率で誤認識を検知し自動再試行
- **講義資料アップロード** — PDF/txt をコンテキストとして渡し、専門用語の精度を向上

### UI / UX
- **SSE ストリーミング** — Whisper 進捗（%）をリアルタイム表示
- **複数ファイルキュー** — ドラッグ＆ドロップで複数ファイルを登録し順次処理
- **インライン編集** — 議事録を画面内で直接編集・保存
- **部分指定再生成** — タイムスタンプ行をチェックボックスで選択し、指定箇所のみで再生成
- **話者名リネーム** — 「話者A」→ 実名への一括変換
- **音声プレイヤー＋同期ハイライト** — 再生位置に合わせて文字起こし行をハイライト、行クリックでシーク

### 出力・エクスポート
- **Markdown / テキストダウンロード**
- **PDF エクスポート** — `window.print()` + 印刷用 CSS（外部ライブラリ不要）
- **クリップボードコピー** — HTML 形式とプレーンテキスト両対応
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
  講義資料がある場合は inlineData で同時送信（RAG）
    ↓
議事録・文字起こしを表示
  自動保存 → data/history/*.json
  ブラウザ通知
```

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

## セットアップ (Setup)

### 前提条件
- Node.js 18 以上
- Python 3.11 以上
- CUDA 対応 GPU 推奨（CPU でも動作しますが処理速度が大幅に低下します）

### インストール

```bash
# 1. リポジトリをクローン
git clone https://github.com/myfavoriteharuto-collab/lecture-minutes.git
cd lecture-minutes

# 2. Node.js 依存インストール
npm install

# 3. Python 仮想環境を作成・有効化
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac / Linux
source .venv/bin/activate

# 4. Whisper と PyTorch をインストール
pip install openai-whisper

# GPU（CUDA 12.8）を使う場合
pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128

# CPU のみの場合
pip install torch

# 5. 話者分離を使う場合（任意）
pip install simple-diarizer

# 6. 環境変数を設定
# .env.local を作成し、Google AI Studio で取得した API キーを記載
echo GOOGLE_API_KEY=your_key_here > .env.local
```

### 起動

```bash
npm run build
npm start
# → http://localhost:3000 を開く
```

> **GPU 要件**: 開発環境は RTX 5070 / sm_120 / PyTorch nightly cu128。CUDA 12.8 以降に対応した GPU であれば高速動作します。

---

## ライセンス

[CC BY-NC-ND 4.0](LICENSE) — 参照・閲覧は自由ですが、商用利用・改変・再配布は禁止です。
