# 日本語歌唱 → 英訳歌唱 Web アプリ

日本語の歌が入った音源と歌詞をアップロードすると、英訳した歌詞で歌い直した音源を生成して
ブラウザで再生／ダウンロードできる Web アプリです。

実験用リポジトリ ([`lyrics`](https://github.com/fsm-lab/seij)) で品質を煮詰めた成果物を
独立した Docker コンテナとして配布できる形に切り出したものです。

---

## 構成要素

```
入力 (mp3/wav) + 日本語歌詞
   ↓
Demucs (htdemucs) で vocals / instrumental に分離
   ↓
DPO 学習済み Gemma で英訳 (1 行ずつ、モーラ数を保つように学習済み)
   ↓
ACE-Step v1.5 XL turbo (5B) の lego モードで
   英訳ボーカルを 10 候補生成 (seed / strength を振った best-of-N)
   ↓
各候補を Demucs で再分離してボーカル成分を抽出
   ↓
原伴奏とミックス (ボーカル +6 dB / インスト −3 dB)
   ↓
Whisper (faster-whisper) で各候補を採点 → 全候補を UI に提示
   ↓
ユーザーは耳で聴いて最終決定 (Whisper 自動採点はあくまで参考順)
```

検討した代替案 (声クローン段: HQ-SVC / Seed-VC / OpenVoice v2) は、いずれも
ボーカル品質を落とすという結論で採用していません。詳細は実験用リポジトリの
コミットログを参照してください。

---

## 動作要件

| 項目 | 要件 |
|---|---|
| GPU | NVIDIA, ≥24 GB VRAM (XL turbo 5B + 5Hz LM を同居させるため) |
| CUDA | 12.8 (Docker イメージ内蔵) |
| ホスト OS | Linux + Docker 24+ + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) |
| ディスク | 40 GB 以上 (モデル 30 GB + キャッシュ) |
| メモリ | 32 GB 以上推奨 |

---

## モデルの配置

リポジトリには重み（合計 30 GB 以上）は含めていません。次のいずれかで配置してください。

### 1. Hugging Face から直接ダウンロード

```bash
mkdir -p models/ace-step-v1.5

# ACE-Step base bundle (acestep-v15-turbo / 5Hz LM / Qwen embedding / VAE)
huggingface-cli download ACE-Step/Ace-Step1.5 \
    --local-dir models/ace-step-v1.5

# ACE-Step XL turbo (5B) — 採用モデル
huggingface-cli download ACE-Step/acestep-v15-xl-turbo \
    --local-dir models/ace-step-v1.5/acestep-v15-xl-turbo

# DPO 学習済み Gemma 翻訳アダプタ
huggingface-cli download <YOUR-DPO-REPO> \
    --local-dir models/gemma-dpo-final
```

DPO アダプタは独自に学習したものを使う前提です。実験リポジトリの
`models/gemma-dpo-final/` をコピー／シンボリックリンクしても構いません。

### 2. 既存ディレクトリをそのまま使う

`./models/` を別パスにシンボリックリンクしても OK です。

```bash
ln -sfn /path/to/existing/models models
```

最終的なレイアウト:

```
models/
├── ace-step-v1.5/
│   ├── acestep-v15-xl-turbo/   ← 採用する DiT (5B)
│   ├── acestep-5Hz-lm-1.7B/    ← 5Hz LM (1.7B)
│   ├── Qwen3-Embedding-0.6B/   ← テキストエンコーダ
│   └── vae/
└── gemma-dpo-final/            ← DPO 翻訳アダプタ
```

`ACE-Step/Ace-Step1.5` の base bundle と `ACE-Step/acestep-v15-xl-turbo` の
XL DiT が必須です。SFT / base 系は採用していません。

---

## 起動

### 一発起動

```bash
./run.sh
```

初回はイメージのビルド (Python deps + ACE-Step のクローン) で 10〜20 分かかります。
完了すると Gradio が `http://localhost:7860/` で待ち受けます。

### よく使うサブコマンド

```bash
./run.sh -d         # デタッチして起動 (ターミナルを閉じても残る)
./run.sh logs       # コンテナのログを追う
./run.sh down       # 停止＆コンテナ削除
./run.sh rebuild    # イメージをキャッシュ無しで作り直す
```

ホスト以外の機器 (LAN 内別 PC など) からアクセスする場合は
`http://<ホスト IP>:7860/` を開いてください。

### ポート番号を変えたいとき

```bash
GRADIO_PORT=8080 ./run.sh -d
```

---

## 使い方

1. ブラウザで `http://localhost:7860/` を開く
2. 左側に **音声ファイル** (mp3 / wav) をアップロード
3. 左側に **日本語歌詞** を 1 行 1 フレーズで貼り付け
4. 「生成」ボタンを押す
5. 進捗バーが完了すると右上に Whisper 採点 1 位の候補が再生可能になる
6. 画面下の **候補一覧** をクリックすると別の候補に切替（耳で比較）
7. 気に入った候補で「ダウンロード」ボタン → wav を保存

ACE-Step は run-to-run で品質変動があるため、**自動採点だけで決めず必ず耳で比較**
してください。10 候補のうち 1〜2 個は「歌になっていない」ことがあります。

---

## アーキテクチャと主要ファイル

```
lyrics-webapp/
├── Dockerfile                  # CUDA 12.8 + Python 3.12 + 依存物
├── docker-compose.yml          # GPU 割当 + ポート + ボリュームマウント
├── run.sh                      # ワンライナー起動スクリプト
├── requirements.txt
├── models/                     # ← ホスト側のモデル配置先 (空)
├── cache/                      # ← 中間生成物 (自動生成)
└── src/
    ├── pipeline/
    │   ├── orchestrator.py     # メインパイプライン (best-of-N 含む)
    │   ├── cache.py            # ハッシュベースのキャッシュ
    │   └── mix.py              # ボーカル + 伴奏のミックス
    ├── separation/
    │   └── demucs_runner.py    # Demucs ラッパー
    ├── translator/
    │   ├── lyrics_translator.py # DPO Gemma 推論
    │   └── sanitize.py         # 翻訳結果サニタイズ
    └── web/
        └── app.py              # Gradio UI
```

### 重要な定数 (`src/pipeline/orchestrator.py` 冒頭)

| 定数 | 既定値 | 役割 |
|---|---|---|
| `ACE_LEGO_CONFIG` | `acestep-v15-xl-turbo` | 採用する DiT |
| `ACE_LEGO_STRENGTH` | `0.28` | source 拘束強度 (採用値) |
| `ACE_LEGO_STEPS` | `16` | 拡散ステップ |
| `ACE_CANDIDATES` | 10 件 | best-of-N の seed × strength 一覧 |

### 環境変数 (docker-compose.yml で設定可能)

| 変数 | 既定値 | 役割 |
|---|---|---|
| `ACE_CKPT_DIR` | `/app/models/ace-step-v1.5` | ACE-Step モデルディレクトリ |
| `DPO_MODEL_PATH` | `/app/models/gemma-dpo-final` | DPO アダプタ |
| `PIPELINE_CACHE_ROOT` | `/app/cache` | 中間生成物の保管先 |
| `HF_HOME` | `/app/.hf` | Hugging Face hub キャッシュ |
| `GRADIO_HOST` | `0.0.0.0` | bind するホスト |
| `GRADIO_PORT` | `7860` | bind するポート |

---

## 上流リポジトリ (`lyrics`) との関係

このリポジトリは
[`lyrics`](https://github.com/fsm-lab/seij) の `claude/elegant-cannon-bcd0f4`
ブランチで実験を続けている内容のうち、**プロダクション品質に達した部分だけ** を
コピーした「成果物」です。

```
upstream (lyrics)               this repo (lyrics-webapp)
─────────────────                ───────────────────────
品質改善実験 / パラメータ探索 →  動作する Web アプリとして配布
変動するコード                    安定した状態をコピー
```

### 同期方針

* upstream で品質改善が確定したら、**手動で該当ファイルをコピー** してこちらにも反映する。
* `src/` 配下の各モジュールは上流の `src/` 配下とディレクトリ構成を揃えてあるので、
  upstream を編集 → 該当ファイルだけコピー、で取り込みやすいはず。
* `Dockerfile` / `docker-compose.yml` / `run.sh` / `README.md` はこちら独自。
* 上流が大きく構造を変えた場合 (例: `orchestrator_v3.py` に置換) は、ファイル名と
  `src/web/app.py` の import 文を一緒に更新する。

### 取り込みフローの例

upstream で `src/pipeline/orchestrator_v2.py` を改善した場合:

```bash
# upstream で改善コミットを作成
cd ~/lyrics/.claude/worktrees/elegant-cannon-bcd0f4
# (試聴 → コミット → push)

# 本リポジトリに反映
cp ~/lyrics/.claude/worktrees/elegant-cannon-bcd0f4/src/pipeline/orchestrator_v2.py \
   ~/lyrics-webapp/src/pipeline/orchestrator.py

# Docker キャッシュは Python レイヤだけ残せばよいので requirements が同じなら早い
cd ~/lyrics-webapp
./run.sh rebuild
```

`requirements.txt` を変える場合は `./run.sh rebuild` で Python レイヤから作り直し。

---

## 知見・既知の制約

* **ACE-Step lego は run-to-run で品質変動が大きい**。同じ seed でもセッションが変わると
  違う出力になるため best-of-N + ユーザー選択が前提。
* **歌い手のクローンは諦めている**。ACE-Step turbo のデフォルト話者で英訳ボーカルが
  そのまま出てくる。元歌手の声色と離れる曲では違和感がある。
* **str=0.28 はあくまで hananinatte.mp3 で最適化した値**。他の曲では 0.25〜0.30 の
  範囲で再調整が必要かもしれない。
* **無音区間 (ソロボーカル区間) で生成が薄くなる**ことがある。原伴奏の音響密度が
  低い箇所ではモデルが生成を弱める性質。
* **歌詞は 1 行ずつ独立に翻訳されている**。前後の文脈は使っていないため、節をまたぐ
  代名詞などが噛み合わないことがある。

---

## ライセンス

このリポジトリのコードは MIT ライセンスとします。ただし依存ライブラリのライセンスは
個別に従ってください:

* ACE-Step v1.5: Apache 2.0
* Demucs: MIT
* Gradio: Apache 2.0
* faster-whisper: MIT
* DPO Gemma adapter: ベースモデルである `google/gemma-2-2b` のライセンスに従う

商用利用や Web 公開を行う場合は、依存ライブラリと配布モデルのライセンスを必ず確認
してください。
