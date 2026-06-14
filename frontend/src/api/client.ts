import type { GenConfig, JobResult, Preset } from '../types';

export async function createJob(config: GenConfig, audioFile: File): Promise<string> {
  const form = new FormData();
  form.append('audio_file', audioFile);
  form.append('lyrics', config.lyrics);
  form.append('translation_model', config.tModel);
  form.append('cover_model', config.cModel);
  form.append('mode', config.params.mode);
  form.append('seed', String(config.params.seed));
  form.append('strength', String(config.params.strength));
  form.append('candidates', String(config.params.candidates));
  form.append('scoring', config.params.scoring);
  form.append('threshold', String(config.params.threshold));
  form.append('preset_json', JSON.stringify(config.preset));

  console.info('[API] POST /api/jobs', {
    audio: audioFile.name,
    audio_size: audioFile.size,
    tModel: config.tModel,
    cModel: config.cModel,
    params: config.params,
  });

  const res = await fetch('/api/jobs', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[API] POST /api/jobs failed', res.status, body);
    throw new Error(`Failed to create job: ${res.status} ${body || ''}`.trim());
  }
  const { job_id } = await res.json();
  console.info('[API] job created', job_id);
  return job_id;
}

export async function getJobResult(jobId: string): Promise<JobResult> {
  console.info('[API] GET /api/jobs/' + jobId + '/result');
  const res = await fetch(`/api/jobs/${jobId}/result`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[API] GET result failed', res.status, body);
    throw new Error(`Failed to fetch result: ${res.status} ${body || ''}`.trim());
  }
  return res.json();
}

export async function listPresets(): Promise<Preset[]> {
  const res = await fetch('/api/presets');
  if (!res.ok) throw new Error('Failed to load presets');
  const data = await res.json();
  return data.presets;
}

export async function savePreset(preset: Omit<Preset, 'id' | 'created_at' | 'builtin'>): Promise<Preset> {
  const res = await fetch('/api/presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preset),
  });
  if (!res.ok) throw new Error('Failed to save preset');
  return res.json();
}

export async function deletePreset(presetId: string): Promise<void> {
  const res = await fetch(`/api/presets/${presetId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete preset');
}

export interface JobReport {
  job_id: string;
  translation: { id: number; ja: string; mora: number; en: string }[];
  candidates: { rank: number; tag: string; score: number; seed: number; strength: number; mode: string; vocal_db: number; transcript: string }[];
}

export async function getJobReport(jobId: string): Promise<JobReport> {
  const res = await fetch(`/api/jobs/${jobId}/report`);
  if (!res.ok) throw new Error(`Failed to fetch report: ${res.status}`);
  return res.json();
}
