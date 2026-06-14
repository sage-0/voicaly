"""
src/translator/remote_translator.py
====================================
webapp 側 (transformers 4.57) で動く Gemma-4 DPO リモート翻訳クライアント。
GPU モデルは保持せず、gemma4_service へ HTTP POST するだけ。
"""

import json
import re
import urllib.request
from typing import Iterator

import pykakasi


class RemoteTranslator:
    """gemma4_service (別コンテナ) に HTTP で翻訳を委譲するクライアント。

    インターフェースは LyricsTranslator と共通:
      - count_mora(text) -> int
      - translate_iter(lyrics_list, max_new_tokens, temperature, top_p) -> Iterator[dict]
    """

    def __init__(self, service_url: str):
        self.service_url = service_url.rstrip("/")
        self.kks = pykakasi.kakasi()

    # ------------------------------------------------------------------
    # mora カウント (lyrics_translator.py の LyricsTranslator.count_mora
    # と同一ロジックをここに複製)
    # ------------------------------------------------------------------

    def _get_kana(self, text: str) -> str:
        result = self.kks.convert(text)
        return "".join([item["kana"] for item in result])

    def count_mora(self, text: str) -> int:
        """Count the number of mora in a Japanese text using regex."""
        if not text:
            return 0
        kana = self._get_kana(text)
        remove_chars = [
            ",", ".", "!", "?", "_",
            "。", "、", "「", "」", "・", "『", "』", "…", "【", "】", "（", "）", "〜",
            " ", "　",
        ]
        for ch in remove_chars:
            kana = kana.replace(ch, "")
        if not kana:
            return 0

        c1 = "[ウクスツヌフムユルグズヅブプヴうくすつぬふむゆるぐずづぶぷゔ][ァィェォぁぃぇぉ]"
        c2 = "[イキシチニヒミリギジヂビピいきしちにひみりぎじぢびぴ][ャュェョゃゅぇょ]"
        c3 = "[テデてで][ィュぃゅ]"
        c4 = "[ァ-ヴぁ-ゔー]"

        cond = f"(?:{c1}|{c2}|{c3}|{c4})"
        re_mora = re.compile(cond)
        mora_list = re_mora.findall(kana)
        return len(mora_list)

    # ------------------------------------------------------------------
    # 翻訳
    # ------------------------------------------------------------------

    def translate_iter(
        self,
        lyrics_list: list,
        max_new_tokens: int = 60,
        temperature: float = 0.5,
        top_p: float = 0.9,
    ) -> Iterator[dict]:
        """空行を除いた行を gemma4_service に一括送信し、1行ずつ yield する。

        yield する dict は LyricsTranslator.translate_iter と同一形式:
          {
            "original_japanese": str,
            "target_syllables": int,
            "english_translation": str,
          }
        """
        # 空行を除いた実行対象行
        lines = [ln for ln in lyrics_list if ln.strip()]

        if not lines:
            return

        payload = json.dumps(
            {
                "lines": lines,
                "max_new_tokens": max_new_tokens,
                "temperature": temperature,
                "top_p": top_p,
            }
        ).encode("utf-8")

        url = f"{self.service_url}/translate"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=600) as resp:
            body = resp.read().decode("utf-8")

        data = json.loads(body)
        translations: list = data.get("translations", [])

        # 件数不一致時は安全に空文字で埋める
        for i, line in enumerate(lines):
            english = translations[i] if i < len(translations) else ""
            yield {
                "original_japanese": line,
                "target_syllables": self.count_mora(line),
                "english_translation": english,
            }
