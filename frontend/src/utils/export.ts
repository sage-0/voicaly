import type { JobResult, GenConfig, Candidate } from '../types';

/**
 * Build a Markdown document that mirrors what the user sees on the Results
 * screen: configuration parameters, the selected candidate, and the full
 * Japanese ↔ English translation table.
 */
export function buildTranslationMarkdown(
  result: JobResult,
  config: GenConfig,
  selected: Candidate | null,
): string {
  const p = config.params;
  const now = new Date();
  const stamp = now.toISOString().replace('T', ' ').slice(0, 19);

  const lines: string[] = [];
  lines.push('# Utaime — Translation Result');
  lines.push('');
  lines.push(`_Generated: ${stamp}_`);
  lines.push('');

  lines.push('## Configuration');
  lines.push('');
  lines.push('| 項目 | 値 |');
  lines.push('|---|---|');
  lines.push(`| Audio file | ${escapeMd(config.audioFile?.name ?? '—')} |`);
  lines.push(`| Translation Model | ${config.tModel} |`);
  lines.push(`| Cover Model | ${config.cModel} |`);
  lines.push(`| Mode | ${p.mode} |`);
  lines.push(`| Seed | ${p.seed} |`);
  lines.push(`| Strength | ${p.strength.toFixed(2)} |`);
  lines.push(`| Candidates | ${p.candidates} |`);
  lines.push(`| Scoring | ${p.scoring} |`);
  lines.push(`| Threshold | ${p.threshold.toFixed(2)} |`);
  lines.push('');

  if (selected) {
    lines.push('## Selected Candidate');
    lines.push('');
    lines.push(`- Rank: #${selected.rank}`);
    lines.push(`- Tag: \`${selected.tag}\``);
    lines.push(`- Score: ${selected.score.toFixed(4)}`);
    lines.push(`- Seed: ${selected.seed}`);
    lines.push(`- Strength: ${selected.strength.toFixed(2)}`);
    lines.push(`- Mode: ${selected.mode}`);
    lines.push('');
  }

  if (result.candidates.length > 0) {
    lines.push('## All Candidates (by score)');
    lines.push('');
    lines.push('| Rank | Tag | Score | Seed | Strength | Mode |');
    lines.push('|---|---|---|---|---|---|');
    for (const c of result.candidates) {
      lines.push(
        `| #${c.rank} | \`${c.tag}\` | ${c.score.toFixed(4)} | ${c.seed} | ${c.strength.toFixed(2)} | ${c.mode} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Translation');
  lines.push('');
  lines.push('| # | 日本語 | Mora | English |');
  lines.push('|---|---|---|---|');
  for (const row of result.translation) {
    lines.push(`| ${row.id} | ${escapeMd(row.ja)} | ${row.mora} | ${escapeMd(row.en)} |`);
  }
  lines.push('');

  return lines.join('\n');
}

/** Pipes-and-backslashes are the only thing that breaks markdown tables. */
function escapeMd(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/** Trigger a browser download with the given content. */
export function downloadTextFile(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build a filename slug from the audio file name (no extension) + a timestamp. */
export function suggestedFilename(audioName: string | undefined, ext: string): string {
  const base = (audioName ?? 'translation')
    .replace(/\.[^.]+$/, '')
    .replace(/[\s/\\?%*:|"<>]+/g, '_')
    .slice(0, 60) || 'translation';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${base}_${ts}.${ext}`;
}
