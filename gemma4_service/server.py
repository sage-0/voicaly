#!/usr/bin/env python3
"""
gemma4_service/server.py
========================
Gemma-4 DPO 翻訳専用の軽量 HTTP サービス。
標準ライブラリ (http.server / json / urllib) + transformers/torch/peft のみ使用。

起動例:
  GEMMA4_BASE=google/gemma-4-E2B-it \
  GEMMA4_ADAPTER=/workspace/models/gemma4-dpo \
  GEMMA4_PORT=8000 \
  /opt/venv-g4/bin/python gemma4_service/server.py

エンドポイント:
  POST /translate  body: {"lines":[...], "max_new_tokens":60, "temperature":0.5, "top_p":0.9}
                   resp: {"translations":[str,...]}
  GET  /health     resp: {"status":"ok","model_loaded":true/false}
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

# ---------------------------------------------------------------------------
# 環境変数
# ---------------------------------------------------------------------------
GEMMA4_BASE = os.environ.get("GEMMA4_BASE", "google/gemma-4-E2B-it")
GEMMA4_ADAPTER = os.environ.get("GEMMA4_ADAPTER", "/workspace/models/gemma4-dpo")
GEMMA4_PORT = int(os.environ.get("GEMMA4_PORT", "8000"))

# ---------------------------------------------------------------------------
# プロンプトテンプレート (gen_rs_data.py の USER_MESSAGE_TEMPLATE と byte 一致)
# ---------------------------------------------------------------------------
USER_MESSAGE_TEMPLATE = (
    "You are a highly skilled professional Japanese-English and English-Japanese translator. "
    "Translate the given text accurately.\n\n"
    "Translate Japanese to English.\n"
    "Source: {src}\n"
    "Target: "
)

# ---------------------------------------------------------------------------
# グローバルモデル保持
# ---------------------------------------------------------------------------
_model = None
_tokenizer = None
_model_loaded = False


def load_model():
    """起動時に1度だけ呼ばれる。モデルをグローバルに保持する。"""
    global _model, _tokenizer, _model_loaded

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    print(f"[gemma4-svc] Loading tokenizer: {GEMMA4_BASE}", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(GEMMA4_BASE)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print(f"[gemma4-svc] Loading base model: {GEMMA4_BASE}", flush=True)
    base = AutoModelForCausalLM.from_pretrained(
        GEMMA4_BASE,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )
    print(f"[gemma4-svc] Base model loaded. Attaching DPO adapter: {GEMMA4_ADAPTER}", flush=True)
    model = PeftModel.from_pretrained(base, GEMMA4_ADAPTER)
    model.eval()

    _tokenizer = tokenizer
    _model = model
    _model_loaded = True
    print(
        f"[gemma4-svc] Model ready. device={next(model.parameters()).device}",
        flush=True,
    )


# ---------------------------------------------------------------------------
# 翻訳ロジック (gen_rs_data.py の make_prompt_chat / generate_candidates と同一)
# ---------------------------------------------------------------------------

def _translate_one(src: str, max_new_tokens: int, temperature: float, top_p: float) -> str:
    """1行を翻訳して文字列を返す。"""
    import torch

    # プロンプト構築 (gen_rs_data.py の make_prompt_chat と同一ロジック)
    user_content = USER_MESSAGE_TEMPLATE.format(src=src)
    messages = [{"role": "user", "content": user_content}]
    prompt = _tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=False,
    )

    inputs = _tokenizer(prompt, return_tensors="pt").to(_model.device)
    input_len = inputs["input_ids"].shape[1]

    with torch.no_grad():
        outputs = _model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            do_sample=True,
            pad_token_id=_tokenizer.eos_token_id,
        )

    # 入力長以降を decode (gen_rs_data.py の generate_candidates と同一)
    raw = _tokenizer.decode(outputs[0][input_len:], skip_special_tokens=True).strip()
    # "Target:" 残骸の除去 (gen_rs_data.py と同様)
    if raw.startswith("Target:"):
        raw = raw[len("Target:"):].strip()
    return raw


# ---------------------------------------------------------------------------
# HTTP ハンドラ
# ---------------------------------------------------------------------------

class _Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # デフォルトのアクセスログを標準出力へ (flush)
        print(f"[gemma4-svc] {self.address_string()} - {format % args}", flush=True)

    def _send_json(self, status: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "model_loaded": _model_loaded})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/translate":
            self._send_json(404, {"error": "not found"})
            return

        # リクエストボディ読み取り
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)
        try:
            req = json.loads(raw_body.decode("utf-8"))
        except Exception as e:
            self._send_json(400, {"error": f"JSON parse error: {e}"})
            return

        lines = req.get("lines", [])
        if not isinstance(lines, list):
            self._send_json(400, {"error": "'lines' must be a list"})
            return

        max_new_tokens = int(req.get("max_new_tokens", 60))
        temperature = float(req.get("temperature", 0.5))
        top_p = float(req.get("top_p", 0.9))

        if not _model_loaded:
            self._send_json(503, {"error": "model not loaded yet"})
            return

        translations = []
        try:
            for line in lines:
                t = _translate_one(str(line), max_new_tokens, temperature, top_p)
                translations.append(t)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json(500, {"error": str(e)})
            return

        self._send_json(200, {"translations": translations})


# ---------------------------------------------------------------------------
# エントリポイント
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_model()
    server = HTTPServer(("0.0.0.0", GEMMA4_PORT), _Handler)
    print(f"[gemma4-svc] Listening on 0.0.0.0:{GEMMA4_PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[gemma4-svc] Shutting down.", flush=True)
        sys.exit(0)
