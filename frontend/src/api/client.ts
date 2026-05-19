import type { GenConfig, JobResult } from '../types';

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

  const res = await fetch('/api/jobs', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Failed to create job: ${res.status}`);
  const { job_id } = await res.json();
  return job_id;
}

export async function getJobResult(jobId: string): Promise<JobResult> {
  const res = await fetch(`/api/jobs/${jobId}/result`);
  return res.json();
}
