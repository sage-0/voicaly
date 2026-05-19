import os
import re
import json
import torch
import pykakasi
from transformers import AutoModelForCausalLM, AutoTokenizer
from tqdm import tqdm

class LyricsTranslator:
    def __init__(self, model_path: str, device: str = None):
        self.kks = pykakasi.kakasi()
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
            
        print(f"Loading model from {model_path} on {self.device}...")
        
        # Check if model_path is a PEFT adapter
        is_peft = os.path.exists(os.path.join(model_path, "adapter_config.json"))
        if is_peft:
            with open(os.path.join(model_path, "adapter_config.json"), "r") as f:
                adapter_config = json.load(f)
            base_model_path = adapter_config.get("base_model_name_or_path", "webbigdata/gemma-2-2b-jpn-it-translate")
            print(f"Detected PEFT adapter. Loading base model: {base_model_path}")
            self.tokenizer = AutoTokenizer.from_pretrained(base_model_path)
            self.model = AutoModelForCausalLM.from_pretrained(
                base_model_path,
                torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
                device_map="auto" if self.device == "cuda" else None
            )
            from peft import PeftModel
            self.model = PeftModel.from_pretrained(self.model, model_path)
        else:
            self.tokenizer = AutoTokenizer.from_pretrained(model_path)
            self.model = AutoModelForCausalLM.from_pretrained(
                model_path,
                torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
                device_map="auto" if self.device == "cuda" else None
            )

        if self.device != "cuda" and not hasattr(self.model, "hf_device_map"):
             self.model = self.model.to(self.device)
        self.model.eval()

    def get_kana(self, text: str) -> str:
        """Convert Japanese text to Kana."""
        result = self.kks.convert(text)
        return "".join([item['kana'] for item in result])

    def count_mora(self, text: str) -> int:
        """Count the number of mora in a Japanese text using regex."""
        if not text:
            return 0
        kana = self.get_kana(text)
        remove_chars = [',', '.', '!', '?', '_', '。', '、', '「', '」', '・', '『', '』', '…', '【', '】', '（', '）', '〜', ' ', '\u3000']
        for ch in remove_chars:
            kana = kana.replace(ch, '')
        if not kana:
            return 0

        c1 = '[ウクスツヌフムユルグズヅブプヴうくすつぬふむゆるぐずづぶぷゔ][ァィェォぁぃぇぉ]'
        c2 = '[イキシチニヒミリギジヂビピいきしちにひみりぎじぢびぴ][ャュェョゃゅぇょ]'
        c3 = '[テデてで][ィュぃゅ]'
        c4 = '[ァ-ヴぁ-ゔー]'

        cond = f'(?:{c1}|{c2}|{c3}|{c4})'
        re_mora = re.compile(cond)
        mora_list = re_mora.findall(kana)
        return len(mora_list)

    def build_prompt(self, japanese_text: str, target_syllables: int) -> str:
        """Construct the prompt for the DPO-trained model."""
        sys_prompt = (
            "You are a professional lyrics translator. Translate the following Japanese lyrics into English.\n"
            "CRITICAL CONSTRAINTS:\n"
            "1. Meaning must be preserved naturally.\n"
            f"2. The English translation MUST have exactly or close to {target_syllables} syllables to match the rhythm.\n"
            "3. Output ONLY the translated English text. Do not add any notes, metadata, bullet points, or explanations.\n"
        )
        
        prompt = (
            f"<start_of_turn>user\n"
            f"{sys_prompt}\n"
            f"Japanese: {japanese_text}\n"
            f"Target Syllables: {target_syllables}\n"
            f"<end_of_turn>\n"
            f"<start_of_turn>model\n"
        )
        return prompt

    def _translate_one(self, line: str, max_new_tokens: int, temperature: float, top_p: float) -> dict:
        """Translate a single line and return the raw result dict."""
        mora_count = self.count_mora(line)
        prompt = self.build_prompt(line, mora_count)

        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=True,
                pad_token_id=self.tokenizer.eos_token_id,
                eos_token_id=self.tokenizer.eos_token_id,
            )

        input_length = inputs.input_ids.shape[1]
        generated_tokens = outputs[0][input_length:]
        translation = self.tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()

        return {
            "original_japanese": line,
            "target_syllables": mora_count,
            "english_translation": translation,
        }

    def translate(self, lyrics_list: list, max_new_tokens: int = 50, temperature: float = 0.7, top_p: float = 0.9):
        """Translate a list of Japanese lyrics to English (blocking, returns the full list)."""
        results = []
        for line in tqdm(lyrics_list, desc="Translating Lyrics"):
            if not line.strip():
                continue
            results.append(self._translate_one(line, max_new_tokens, temperature, top_p))
        return results

    def translate_iter(self, lyrics_list: list, max_new_tokens: int = 50, temperature: float = 0.7, top_p: float = 0.9):
        """Streaming version of translate(). Yields each line's result dict as soon as it's produced."""
        for line in lyrics_list:
            if not line.strip():
                continue
            yield self._translate_one(line, max_new_tokens, temperature, top_p)

    def save_to_json(self, results: list, output_path: str):
        """Save translation results to a JSON file."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=4)
        print(f"Saved translation results to {output_path}")

if __name__ == "__main__":
    # Test execution
    default_model = "./gemma-finetuned-v2"  # Adjust as needed
    if os.path.exists(default_model):
        translator = LyricsTranslator(model_path=default_model)
        sample_lyrics = ["無自覚なまんま 愛を蓄えて", "花になって"]
        res = translator.translate(sample_lyrics)
        translator.save_to_json(res, "output/test_translations.json")
    else:
        print(f"Model directory '{default_model}' not found. Please provide a valid DPO model path.")
