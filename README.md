# Voicaly
<img width="1561" height="896" alt="image" src="https://github.com/user-attachments/assets/1a7e8c6e-d078-4fa8-bd30-214a6191ab97" />

日本語の歌が入った音源と歌詞をアップロードすると、**英訳した歌詞で歌い直した音源**を生成し、
ブラウザで再生・ダウンロードできる Web アプリです。翻訳モデルは好きなものに差し替えて使えます。

> このリポジトリは **BYO（Bring Your Own）モデル版**です。翻訳モデルは同梱せず、
> HuggingFace の任意のモデル、または自分で用意したアダプタを指定して動かします。

---

## 仕組み

```
入力 (mp3/wav) + 日本語歌詞
   ↓
Demucs (htdemucs) で vocals / instrumental に分離
   ↓
Gemma 系 LLM で英訳 (1 行ずつ、モーラ数を保つよう学習されたモデルを想定)
   ↓
ACE-Step v1.5 XL turbo (5B) の lego モードで英訳ボーカルを複数候補生成
   (seed / strength を振った best-of-N)
   ↓
各候補を Demucs で再分離してボーカルを抽出 → 原伴奏とミックス
   ↓
Whisper (faster-whisper) で各候補を採点 → 全候補を UI に提示
   ↓
ユーザーが耳で聴いて最終決定 (Whisper 採点はあくまで参考順)
```

バックエンドは FastAPI、フロントエンドは React + Vite。すべて 1 つの Docker イメージに同梱されます。

---

## 必要環境

- Docker + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- NVIDIA GPU（**VRAM 24GB 以上**推奨）
- 初回起動時のディスク空き容量 **40GB 以上**（ACE-Step v1.5 チェックポイント約 33GB + ベースモデル）

---

## クイックスタート

```bash
git clone git@github.com:sage-0/voicaly.git
cd voicaly
./run.sh            # .env を自動生成し、ビルド + 起動
```

- 初回は ACE-Step v1.5（約 33GB）とベースモデルを **自動ダウンロード**します（名前付きボリュームに永続化され、次回以降は再取得しません）。
- 起動後 `http://localhost:7860/` を開きます（ポートは `.env` の `WEBAPP_PORT` で変更可）。

```bash
./run.sh -d         # バックグラウンド起動
./run.sh logs       # ログ表示
./run.sh down       # 停止・削除
./run.sh rebuild    # イメージを作り直して再起動
```

---

## 翻訳モデルの差し替え（このリポジトリの主眼）

翻訳モデルは `.env` の `DPO_MODEL_PATH` で指定します。**2 通り**の指定ができます。

### 1. HuggingFace のモデル ID を指定（最も簡単）

```dotenv
# .env
DPO_MODEL_PATH=webbigdata/gemma-2-2b-jpn-it-translate
```

初回利用時に自動ダウンロードされます。デフォルトはこの公開モデル（日→英、トークン不要）なので、
**クローンしてそのまま動きます**。お好みの翻訳モデル ID に変えるだけで差し替え完了です。

> gated モデル（例: `google/gemma-*`）を使う場合は `.env` の `HF_TOKEN` にトークンを設定してください。

### 2. 自分のアダプタ / モデルディレクトリを置く

LoRA アダプタや学習済みモデルを `./models/` 配下に置き、そのパスを指定します。

```bash
cp -r /path/to/my-dpo-adapter ./models/my-model     # adapter_config.json + adapter_model.safetensors を含むディレクトリ
```
```dotenv
# .env
DPO_MODEL_PATH=/app/models/my-model
```

- **LoRA アダプタ**を置いた場合、`adapter_config.json` の `base_model_name_or_path` からベースモデルを自動取得します。
- **フルモデル**ディレクトリでもそのまま読み込めます。
- `./models` はコンテナに read-only でマウントされます（`/app/models`）。

### UI 上のモデル選択について

UI には 3 つのスロット（`DPO Gemma 2B` / `DPO Gemma 3 4B` / `DPO Gemma 4 E2B`）があります。
このうち先頭の **`DPO Gemma 2B` スロットが `DPO_MODEL_PATH` に対応**します。
残り 2 スロットは `./models/gemma3-dpo` / `./models/gemma4-dpo` を配置した場合のみ有効になり、
未配置のスロットを選ぶと「not deployed」とエラーになります（gemma4 は下記マイクロサービスが必要）。

---

## 設定（`.env`）

| 変数 | 説明 | 既定 |
|------|------|------|
| `WEBAPP_PORT` | 公開ポート | `7860` |
| `DPO_MODEL_PATH` | 翻訳モデル（HF ID か `/app/models/...`） | `webbigdata/gemma-2-2b-jpn-it-translate` |
| `HF_TOKEN` | gated モデル用 HF トークン | （空） |

---

## 既存のダウンロード資産を再利用する

ACE-Step スナップショットや HuggingFace キャッシュを既に持っている場合、再ダウンロードを避けられます。

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
# 中のホストパスを自分の環境に合わせて編集
```

---

## オプション: gemma4-dpo マイクロサービス

`google/gemma-4-E2B-it`（gated）ベースの gemma4-dpo は transformers 5.x を要求し、ACE-Step と同居できないため
別コンテナで動かします。使う場合のみ起動してください。

```bash
# .env に HF_TOKEN を設定し、./models/gemma4-dpo にアダプタを配置した上で:
docker compose --profile gemma4 up --build -d
```

---

## コマンドまとめ

| 操作 | コマンド |
|------|----------|
| 起動（フォア） | `./run.sh` |
| 起動（バック） | `./run.sh -d` |
| ログ | `./run.sh logs` |
| 停止 | `./run.sh down` |
| 再ビルド | `./run.sh rebuild` |
| gemma4 サービス併用 | `docker compose --profile gemma4 up --build -d` |

---

## 謝辞・ライセンス

- 歌唱生成: [ACE-Step v1.5](https://github.com/ace-step/ACE-Step-1.5)
- 音源分離: [Demucs](https://github.com/facebookresearch/demucs)
- 文字起こし採点: [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- 翻訳ベース例: [webbigdata/gemma-2-2b-jpn-it-translate](https://huggingface.co/webbigdata/gemma-2-2b-jpn-it-translate)

各モデル・ライブラリのライセンスはそれぞれの配布元に従います。
