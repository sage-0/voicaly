import { useRef, useState } from 'react';
import type { JobResult, GenConfig, Candidate } from '../types';
import { Player, type PlayerHandle } from '../components/Player';
import { SectionLabel } from '../components/SectionLabel';
import { buildTranslationMarkdown, downloadTextFile, suggestedFilename } from '../utils/export';

interface ResultsPhaseProps {
  result: JobResult;
  config: GenConfig;
  onReset: () => void;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ height: 3, borderRadius: 2, background: 'var(--s3)', overflow: 'hidden', marginTop: 4 }}>
      <div
        style={{
          height: '100%',
          width: `${Math.round(score * 100)}%`,
          background: score >= 0.7 ? 'var(--teal)' : score >= 0.5 ? 'var(--accent)' : '#f87171',
          borderRadius: 2,
          transition: 'width .4s',
        }}
      />
    </div>
  );
}

export function ResultsPhase({ result, config, onReset }: ResultsPhaseProps) {
  const [selectedCand, setSelectedCand] = useState<Candidate>(
    result.candidates[0] ?? {
      rank: 1,
      tag: 'demo',
      score: 0.82,
      audio_url: '',
      seed: config.params.seed,
      strength: config.params.strength,
      mode: config.params.mode,
    },
  );
  const [playing, setPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'translation' | 'details'>('translation');
  const playerRef = useRef<PlayerHandle>(null);

  const best = selectedCand;

  // Click a candidate → switch source and auto-play.
  const onCandidatePick = (c: Candidate) => {
    console.info('[Results] candidate selected', c.tag, c.audio_url);
    setSelectedCand(c);
    setPlaying(true);
  };

  // Export the translation + the parameters that produced it as a Markdown
  // file. The user explicitly asked for the config to be included so they
  // can reproduce this exact run later.
  const onDownloadTranslation = () => {
    const md = buildTranslationMarkdown(result, config, selectedCand ?? null);
    const filename = suggestedFilename(config.audioFile?.name, 'md');
    console.info('[Results] downloading translation →', filename);
    downloadTextFile(md, filename, 'text/markdown');
  };

  // Click a lyric line → jump to a proportional position in the audio.
  // We do not have per-line timestamps, so we approximate (line_idx / total)
  // of the total duration. Good enough for navigating a 3-minute song.
  const jumpToLine = (rowIdx: number) => {
    const total = result.translation.length;
    if (total === 0) return;
    const d = playerRef.current?.getDuration() ?? 0;
    if (d <= 0) {
      console.warn('[Results] jumpToLine: duration not loaded yet');
      return;
    }
    const t = (rowIdx / total) * d;
    console.info(`[Results] jumpToLine idx=${rowIdx} total=${total} → ${t.toFixed(2)}s / ${d.toFixed(2)}s`);
    playerRef.current?.seekTo(t);
    if (!playing) setPlaying(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeUp .4s ease both' }}>
      {/* Best candidate player */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <SectionLabel accent="var(--accent)">Best Candidate</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>Score:</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "'DM Mono', monospace",
                color: best.score >= 0.7 ? 'var(--teal)' : 'var(--accent)',
              }}
            >
              {best.score.toFixed(3)}
            </span>
          </div>
        </div>
        <Player
          ref={playerRef}
          label={`Rank #${best.rank} · ${best.tag}`}
          playing={playing}
          onToggle={() => setPlaying(p => !p)}
          seed={best.seed}
          accent="var(--accent)"
          audioUrl={best.audio_url || undefined}
        />
      </div>

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        {/* Candidate sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectionLabel>All Candidates</SectionLabel>
          <div
            style={{
              background: 'var(--s1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r2)',
              overflow: 'hidden',
            }}
          >
            {result.candidates.map((c, i) => {
              const active = c.rank === best.rank;
              return (
                <div
                  key={i}
                  onClick={() => onCandidatePick(c)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: i < result.candidates.length - 1 ? '1px solid var(--border)' : 'none',
                    background: active ? 'var(--accent-s)' : 'transparent',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--s2)';
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: active ? 'var(--accent)' : 'var(--t2)',
                      }}
                    >
                      #{c.rank}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: "'DM Mono', monospace",
                        color: c.score >= 0.7 ? 'var(--teal)' : c.score >= 0.5 ? 'var(--accent)' : '#f87171',
                      }}
                    >
                      {c.score.toFixed(3)}
                    </span>
                  </div>
                  <ScoreBar score={c.score} />
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>{c.tag}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel with tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Tabs + export button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border)',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex' }}>
              {(
                [
                  { id: 'translation', label: 'Translation' },
                  { id: 'details', label: 'Candidate Details' },
                ] as const
              ).map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 500,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: activeTab === t.id ? 'var(--text)' : 'var(--t3)',
                    borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: -1,
                    transition: 'color .15s',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              onClick={onDownloadTranslation}
              title="翻訳結果と設定パラメータを Markdown でダウンロード"
              style={{
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--t2)',
                background: 'var(--s2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hi)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = 'var(--t2)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export .md
            </button>
          </div>

          {activeTab === 'translation' ? (
            <div
              style={{
                background: 'var(--s1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--s2)' }}>
                    {['#', '日本語', 'Mora', 'English'].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--t3)',
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.translation.map((row, i) => (
                    <tr
                      key={row.id}
                      onClick={() => jumpToLine(i)}
                      style={{
                        borderBottom: i < result.translation.length - 1 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--s2)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                      title="クリックでこの行の位置にジャンプ"
                    >
                      <td
                        style={{
                          padding: '10px 14px',
                          color: 'var(--t3)',
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 12,
                        }}
                      >
                        {row.id}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{row.ja}</td>
                      <td
                        style={{
                          padding: '10px 14px',
                          color: 'var(--t3)',
                          fontFamily: "'DM Mono', monospace",
                          textAlign: 'right',
                        }}
                      >
                        {row.mora}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--teal)', fontWeight: 500 }}>{row.en}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { k: 'Rank', v: `#${best.rank}` },
                { k: 'Tag', v: best.tag },
                { k: 'Score', v: best.score.toFixed(4) },
                { k: 'Seed', v: String(best.seed) },
                { k: 'Strength', v: best.strength.toFixed(2) },
                { k: 'Mode', v: best.mode },
                { k: 'T-Model', v: config.tModel },
                { k: 'C-Model', v: config.cModel },
              ].map(({ k, v }) => (
                <div
                  key={k}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r)',
                    background: 'var(--s1)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{k}</div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text)',
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reset button */}
      <button
        onClick={onReset}
        style={{
          padding: '12px 28px',
          borderRadius: 'var(--r)',
          background: 'var(--s2)',
          border: '1px solid var(--border)',
          color: 'var(--t2)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          alignSelf: 'flex-start',
          transition: 'all .15s',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.color = 'var(--text)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hi)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.color = 'var(--t2)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
        }}
      >
        ← New Project
      </button>
    </div>
  );
}
