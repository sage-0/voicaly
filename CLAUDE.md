# Webapp Context
FastAPI (`src/api/`) + Vite/React SPA (`frontend/`) + ACE-Step + Gemma DPO の推論Webアプリ。
SSE で進捗ストリーミング、`threading.Lock` で GPU 衝突防止。
研究記録は /vault/000-AI-Handoff/RESEARCH_CONTEXT.md を参照。
過去ノートを検索するときは `/vault/.ai/INDEX.md`（自動生成インデックス）から当たりをつけてから個別読み込み。

## ビルド (devcontainer 内から)
ホスト docker daemon が `/home/seij/lyrics-webapp/` を参照するため、CLI のパス検証を回避する必要がある:
```
tar -cf - --exclude='./.git' --exclude='./cache' --exclude='./.hf' \
  --exclude='./models' --exclude='./frontend/node_modules' . \
  | docker build -t lyrics-webapp:latest -
```
ホスト依存パスは `.env` (gitignored) で設定: `MODELS_DIR`, `CACHE_DIR`, `HF_DIR`。

## 起動
```
docker compose up -d   # http://localhost:7860/
```
