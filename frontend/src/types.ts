// Only models we actually run today. New ids can be added here without
// touching the rest of the type tree.
export type TranslationModel = 'gemma-dpo';
export type CoverModel = 'ace1';
export type Phase = 'input' | 'processing' | 'results';
export type ScoringMode = 'whisper' | 'ear' | 'both';

export interface PresetCandidate {
  mode: string;       // "lego"
  seed: number;
  strength: number;   // 0.0-1.0
  vocal_db: number;   // 0, -6, -12 etc
}

export interface Preset {
  id: string;
  name: string;
  builtin: boolean;
  created_at: string;
  candidates: PresetCandidate[];
  post_fx_enabled: boolean;
  post_fx_consonant_boost_db: number;
  post_fx_breath_level_db: number;
  // ACE-Step model + sampler fields (added 2026-05-29). All optional on the
  // wire: older user presets that lack them are filled by the backend's
  // Pydantic defaults before they reach the frontend.
  ace_config?: string;
  inference_steps?: number;
  shift?: number;
  cfg_interval_start?: number;
  cfg_interval_end?: number;
  guidance_scale?: number;
  caption_style?: 'baseline' | 'articulation';
  src_kind?: 'full' | 'vocals';
}

export interface TranslationRow {
  id: number;
  ja: string;
  mora: number;
  en: string;
}

export interface Candidate {
  rank: number;
  tag: string;
  score: number;
  audio_url: string;
  seed: number;
  strength: number;
  mode: string;
}

export interface JobResult {
  status: 'done' | 'error' | 'running';
  candidates: Candidate[];
  translation: TranslationRow[];
  error: string | null;
}

export interface GenParams {
  mode: 'lego' | 'standard';
  seed: number;
  strength: number;
  candidates: number;
  scoring: ScoringMode;
  threshold: number;
}

export interface GenConfig {
  lyrics: string;
  tModel: TranslationModel;
  cModel: CoverModel;
  params: GenParams;
  audioFile: File;
  preset: Preset;
}

export interface LogEvent {
  text: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  ts: number; // unix timestamp (seconds)
}

export interface SSEEvent {
  type:
    | 'progress'
    | 'translation_ready'
    | 'translation_line'
    | 'candidate_progress'
    | 'log'
    | 'done'
    | 'error';
  stage?: string;
  pct?: number;
  message?: string;
  /** Final batch of rows (sent once at the end of the translation stage). */
  rows?: TranslationRow[];
  /** A single live row (sent as DPO finishes each line). */
  row?: TranslationRow;
  done?: number;
  total?: number;
  /** Log event fields (type === 'log'). */
  text?: string;
  level?: LogEvent['level'];
  ts?: number;
}
