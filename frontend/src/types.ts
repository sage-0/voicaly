export type TranslationModel = 'claude' | 'gpt4o' | 'gemini' | 'deepl';
export type CoverModel = 'ace1' | 'ace2' | 'ytts' | 'vallex';
export type Phase = 'input' | 'processing' | 'results';
export type ScoringMode = 'whisper' | 'ear' | 'both';

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
}

export interface SSEEvent {
  type: 'progress' | 'translation_ready' | 'candidate_progress' | 'done' | 'error';
  stage?: string;
  pct?: number;
  message?: string;
  rows?: TranslationRow[];
  done?: number;
  total?: number;
}
