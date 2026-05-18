"""Gradio app for the v2 pipeline (ACE-Step lego/cover candidates).

Usage::

    python -m src.web.app_v2

Two-step workflow:

1. ユーザーが音声 + 日本語歌詞をアップロード → 生成ボタン
2. orchestrator が複数候補 (lego / cover) を作って Whisper word-overlap で
   ランキング → 全候補をテーブルで提示
3. ユーザーは各候補を再生して耳で比較、気に入った行を選択 → ダウンロード

ACE-Step は run-to-run 品質変動が大きく Whisper の自動採点が必ずしも
ユーザーの聴感ベストと一致しないため、最終判断は人間の耳に委ねる。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Inside the Docker image, CUDA libs ship with torch wheels under
# /usr/local/lib/python3.11/dist-packages/nvidia/*/lib. We add them to the
# linker path so onnxruntime / ACE-Step can resolve them at import.
_PY_VERSIONS = ("3.12", "3.11", "3.10")
for _ver in _PY_VERSIONS:
    _NV = f"/usr/local/lib/python{_ver}/dist-packages/nvidia"
    if os.path.isdir(_NV):
        _LD = ":".join(
            f"{_NV}/{sub}/lib"
            for sub in ("cublas", "cudnn", "cufft", "curand", "cusparse", "cuda_runtime", "cuda_nvrtc")
            if os.path.isdir(f"{_NV}/{sub}/lib")
        )
        if _LD:
            os.environ["LD_LIBRARY_PATH"] = _LD + ":" + os.environ.get("LD_LIBRARY_PATH", "")
        break

os.environ.setdefault("ACESTEP_CHECKPOINTS_DIR", os.environ.get("ACE_CKPT_DIR", "/app/models/ace-step-v1.5"))

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import gradio as gr  # noqa: E402

from src.pipeline.orchestrator import DEFAULT_DPO_MODEL, run as run_pipeline  # noqa: E402

DPO_MODEL_PATH = os.environ.get("DPO_MODEL_PATH", DEFAULT_DPO_MODEL)
CACHE_ROOT = Path(os.environ.get("PIPELINE_CACHE_ROOT", "/app/cache"))

STAGE_LABEL = {
    "separate": "1/3 ボーカル/伴奏分離 (Demucs)",
    "translate": "2/3 歌詞翻訳 (DPO Gemma)",
    "ace_step": "3/3 英訳ボーカル生成 (best-of-N 候補生成)",
    "done": "完了",
}


def _to_table(translations: list[dict]) -> list[list]:
    return [
        [i + 1, r.get("japanese", ""), r.get("mora_count", 0), r.get("english", "")]
        for i, r in enumerate(translations)
    ]


def _candidates_to_table(candidates: list[dict]) -> list[list]:
    return [
        [
            i + 1,
            c["tag"],
            f"{c['score']:.3f}",
            c["mode"],
            c["seed"],
            f"{c['strength']:.2f}",
            c["final_wav"],
        ]
        for i, c in enumerate(candidates)
    ]


def _generate(audio_path, lyrics_text, progress=gr.Progress()):
    if audio_path is None:
        raise gr.Error("音声ファイルをアップロードしてください")
    if not (lyrics_text or "").strip():
        raise gr.Error("日本語歌詞を入力してください")

    table_rows: list[list] = []
    candidates: list[dict] = []
    timings: list[str] = []

    for stage, pct, payload in run_pipeline(
        Path(audio_path),
        lyrics_text,
        cache_root=CACHE_ROOT,
        dpo_model_path=DPO_MODEL_PATH,
    ):
        label = STAGE_LABEL.get(stage, stage)
        progress(pct, desc=label)
        if "translations" in payload:
            table_rows = _to_table(payload["translations"])
        if "candidates" in payload:
            candidates = payload["candidates"]
        if "elapsed" in payload:
            timings.append(f"{label} {payload['elapsed']}s")

    if not candidates:
        raise gr.Error("候補が生成されませんでした")

    best = candidates[0]
    cand_table = _candidates_to_table(candidates)
    status = (
        f"完了 — {len(candidates)} 候補生成 / 自動推奨: **{best['tag']}** "
        f"(Whisper score={best['score']:.3f})\n\n"
        + " · ".join(timings)
    )

    return (
        best["final_wav"],     # picked audio player
        best["final_wav"],     # picked download
        best["tag"],           # picked tag textbox
        table_rows,            # translation table
        cand_table,            # candidates table
        status,                # status markdown
        candidates,            # state: full candidate manifest
    )


def _pick_candidate(candidates: list[dict], evt: gr.SelectData):
    """Triggered when the user selects a row in the candidates table."""
    if not candidates:
        return None, None, "候補がありません"
    idx = evt.index[0] if isinstance(evt.index, list) else int(evt.index)
    if idx < 0 or idx >= len(candidates):
        return None, None, f"無効な行: {idx}"
    cand = candidates[idx]
    msg = (
        f"選択: **{cand['tag']}** (score={cand['score']:.3f})  \n"
        f"transcript: {cand['detail']}"
    )
    return cand["final_wav"], cand["final_wav"], msg


def build_app() -> gr.Blocks:
    with gr.Blocks(title="日英 歌詞翻訳 歌唱合成") as app:
        gr.Markdown(
            "# 日本語歌唱 → 英訳して歌い直す\n"
            "音源と日本語歌詞をアップロードすると、英訳した歌詞で歌い直した複数候補を生成します。\n"
            "ACE-Step は run-to-run で品質変動するため、**自動採点 (Whisper) と耳テストの両方** で選んでください。\n"
            "200秒の楽曲で best-of-16 を生成すると 5〜7 分かかります。"
        )

        # Hidden state to carry the candidates manifest between events.
        candidates_state = gr.State([])

        with gr.Row():
            with gr.Column(scale=1):
                audio_in = gr.Audio(type="filepath", label="音声ファイル (mp3/wav)")
                lyrics_in = gr.Textbox(
                    lines=18,
                    label="日本語歌詞（1行 = 1フレーズ）",
                    placeholder="陰にそっと隠れようがいいんじゃない？\n蕾のような花だってあんじゃない\n...",
                )
                run_btn = gr.Button("生成", variant="primary")
                status_out = gr.Markdown()

            with gr.Column(scale=1):
                gr.Markdown("### 選択中の候補")
                picked_audio = gr.Audio(label="再生", type="filepath")
                picked_file = gr.File(label="ダウンロード")
                picked_tag = gr.Textbox(label="tag", interactive=False)
                table_out = gr.Dataframe(
                    headers=["#", "日本語", "モーラ", "英訳"],
                    wrap=True,
                    label="翻訳結果",
                )

        gr.Markdown("---")
        gr.Markdown(
            "### 候補一覧（行をクリックして再生）\n"
            "Whisper score 順で並んでいます。上位が必ずしも耳ベストとは限らないので "
            "実際に聞いて選んでください。"
        )
        candidates_table = gr.Dataframe(
            headers=["#", "tag", "score", "mode", "seed", "strength", "final_wav"],
            wrap=True,
            label="候補",
            interactive=False,
        )

        run_btn.click(
            _generate,
            inputs=[audio_in, lyrics_in],
            outputs=[
                picked_audio,
                picked_file,
                picked_tag,
                table_out,
                candidates_table,
                status_out,
                candidates_state,
            ],
        )

        candidates_table.select(
            _pick_candidate,
            inputs=[candidates_state],
            outputs=[picked_audio, picked_file, status_out],
        )

    return app


def main() -> None:
    app = build_app()
    app.queue(default_concurrency_limit=1).launch(
        server_name=os.environ.get("GRADIO_HOST", "0.0.0.0"),
        server_port=int(os.environ.get("GRADIO_PORT", "7860")),
    )


if __name__ == "__main__":
    main()
