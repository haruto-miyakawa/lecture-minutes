#!/usr/bin/env python3
"""
Usage: python transcribe.py <audio_file_path> [model] [diarize]
stdout: JSON行形式で進捗（progress）と結果（done）を出力

事前インストール（RTX5070 / CUDA 13対応）:
  pip install openai-whisper
  pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128

話者分離を使う場合:
  pip install simple-diarizer
"""
import sys
import os
import json

# WindowsのデフォルトエンコーディングがShift-JISになるため明示的にUTF-8へ
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')


def emit(data: dict) -> None:
    """JSON行としてstdoutに出力する（route.tsがSSEとして転送）"""
    print(json.dumps(data, ensure_ascii=False), flush=True)


# Whisperが無音・低品質音声で生成しがちなハルシネーション定型文
HALLUCINATION_PHRASES = [
    "本日はご覧いただきありがとうございます",
    "ご視聴ありがとうございました",
    "チャンネル登録よろしくお願いします",
    "字幕は自動生成されています",
    "ご視聴ありがとうございます",
    "高評価・チャンネル登録よろしくお願いします",
    "最後までご覧いただきありがとうございました",
]


def is_hallucination(result: dict, audio_duration_sec: float) -> bool:
    """ハルシネーションらしい出力かどうか判定する"""
    text = result["text"].strip()

    # 既知の定型文が含まれている
    for phrase in HALLUCINATION_PHRASES:
        if phrase in text:
            return True

    # 音声が1分以上あるのに出力が極端に短い（1分あたり10文字未満）
    if audio_duration_sec > 60 and len(text) < (audio_duration_sec / 60) * 10:
        return True

    # セグメントの無音確率の平均が高い
    segments = result.get("segments", [])
    if segments:
        avg_no_speech = sum(s.get("no_speech_prob", 0) for s in segments) / len(segments)
        if avg_no_speech > 0.7:
            return True

    return False


def get_dominant_speaker(start: float, end: float, diar_segments: list) -> str | None:
    """Whisperセグメントと最も重複する話者ラベルを返す"""
    max_overlap = 0.0
    speaker = None
    for ds in diar_segments:
        overlap = min(end, ds['end']) - max(start, ds['start'])
        if overlap > max_overlap:
            max_overlap = overlap
            speaker = ds['label']
    return speaker


def transcribe(audio_path: str, model_name: str = "large-v3", diarize: bool = False, force_safe: bool = False) -> None:
    import torch
    import whisper
    import tqdm as tqdm_module

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}, model: {model_name}", file=sys.stderr)

    # tqdmをパッチしてWhisperの30秒チャンク処理の進捗をemit
    # Whisperは tqdm(range(0, frames, chunk_size)) でループするため
    # n/total = 処理済みチャンク/全チャンク = 実際の進捗率になる
    OriginalTqdm = tqdm_module.tqdm

    class ProgressTqdm(OriginalTqdm):
        def update(self, n: int = 1) -> bool | None:
            result = super().update(n)
            if self.total and self.total > 0:
                pct = min(round(self.n / self.total * 100, 1), 99)
                # Whisperのモデルダウンロードは unit='iB'（バイト単位）で識別できる
                if getattr(self, 'unit', None) == 'iB':
                    emit({"type": "downloading", "pct": pct})
                else:
                    emit({"type": "progress", "pct": pct})
            return result

    tqdm_module.tqdm = ProgressTqdm
    try:
        # RTX 5070（sm_120）はPyTorch nightly cu128でGPU対応
        audio = whisper.load_audio(audio_path)
        audio_duration = len(audio) / whisper.audio.SAMPLE_RATE
        model = whisper.load_model(model_name, device=device)

        base_options = dict(
            language="ja",
            fp16=(device == "cuda"),
            verbose=False,
            beam_size=5,   # デフォルト値（最高精度）
            best_of=1,     # beam searchのときは1で十分
            temperature=0, # greedy decoding（ランダム性なし・最速）
        )

        safe_options = dict(
            condition_on_previous_text=False,
            no_speech_threshold=0.4,
            compression_ratio_threshold=2.0,
        )

        if force_safe:
            # ユーザーが手動でハルシネーション再解析を指示した場合は直接安全設定で実行
            print("Force safe mode enabled, using hallucination-resistant settings...", file=sys.stderr)
            result = model.transcribe(audio, **{**base_options, **safe_options})
        else:
            result = model.transcribe(audio, **base_options)
            if is_hallucination(result, audio_duration):
                # 自動検知 → 安全設定で再実行
                print("Hallucination detected, retrying with safer settings...", file=sys.stderr)
                emit({"type": "progress", "pct": 10, "retrying": True})
                result = model.transcribe(audio, **{**base_options, **safe_options})
        segments = [
            {"start": s["start"], "end": s["end"], "text": s["text"].strip()}
            for s in result["segments"]
        ]

        if diarize:
            try:
                emit({"type": "progress", "pct": 99, "diarizing": True})
                from simple_diarizer.diarizer import Diarizer
                diar = Diarizer(embed_model='xvec', cluster_method='sc')
                diar_segs = diar.diarize(audio_path, num_speakers=None)

                # SPEAKER_00 → 話者A のラベルマップを構築
                speaker_map: dict[str, str] = {}
                label_chars = list('ABCDEFGHIJ')
                for ds in diar_segs:
                    raw = ds['label']
                    if raw not in speaker_map:
                        speaker_map[raw] = f'話者{label_chars[len(speaker_map) % len(label_chars)]}'

                for seg in segments:
                    dominant = get_dominant_speaker(seg['start'], seg['end'], diar_segs)
                    if dominant:
                        seg['speaker'] = speaker_map.get(dominant, dominant)
            except Exception as e:
                # simple-diarizer 未インストール等の場合は話者ラベルなしで継続
                print(f"Diarization skipped: {e}", file=sys.stderr)

        emit({"type": "done", "text": result["text"], "segments": segments, "engine": "openai-whisper"})
    finally:
        tqdm_module.tqdm = OriginalTqdm


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python transcribe.py <audio_file> [model]", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    whisper_model = sys.argv[2] if len(sys.argv) > 2 else "large-v3"
    diarize = sys.argv[3].lower() == 'true' if len(sys.argv) > 3 else False
    force_safe = sys.argv[4].lower() == 'true' if len(sys.argv) > 4 else False
    if not os.path.exists(audio_path):
        print(f"File not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    try:
        transcribe(audio_path, whisper_model, diarize, force_safe)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
