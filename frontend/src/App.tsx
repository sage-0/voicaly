import { useState } from 'react';
import type { GenConfig, JobResult } from './types';
import { createJob } from './api/client';
import { InputPhase } from './phases/InputPhase';
import { ProcessingPhase } from './phases/ProcessingPhase';
import { ResultsPhase } from './phases/ResultsPhase';

type AppState =
  | { phase: 'input' }
  | { phase: 'processing'; config: GenConfig; jobId: string }
  | { phase: 'results'; result: JobResult; config: GenConfig };

const PHASES = ['Input', 'Processing', 'Results'] as const;

function PhaseIndicator({ current }: { current: 'input' | 'processing' | 'results' }) {
  const idx = current === 'input' ? 0 : current === 'processing' ? 1 : 2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {PHASES.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <div style={{ width: 20, height: 1, background: i <= idx ? 'var(--border-hi)' : 'var(--border)' }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === idx ? 'var(--accent)' : i < idx ? 'var(--teal)' : 'var(--border)',
              boxShadow: i === idx ? '0 0 8px var(--accent)' : 'none',
              transition: 'all .3s',
            }} />
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: i === idx ? 'var(--text)' : i < idx ? 'var(--t2)' : 'var(--t3)',
              transition: 'color .3s',
            }}>
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>({ phase: 'input' });
  const [genError, setGenError] = useState<string | null>(null);

  const handleGenerate = async (config: GenConfig) => {
    setGenError(null);
    try {
      const jobId = await createJob(config, config.audioFile);
      setState({ phase: 'processing', config, jobId });
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to start job');
    }
  };

  const handleComplete = (result: JobResult) => {
    if (state.phase === 'processing') {
      setState({ phase: 'results', result, config: state.config });
    }
  };

  const handleReset = () => setState({ phase: 'input' });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--s1)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{
          maxWidth: 960, margin: '0 auto', padding: '0 24px',
          height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800, fontSize: 22,
              background: 'linear-gradient(90deg, var(--accent), #f0a060)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Utaime
            </span>
            <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 400 }}>
              日本語歌唱 → English Cover Generator
            </span>
          </div>
          <PhaseIndicator current={state.phase} />
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        {genError && (
          <div style={{
            padding: '12px 16px', marginBottom: 20, borderRadius: 'var(--r)',
            background: '#3a0a0a', border: '1px solid #7a2020', color: '#f87171', fontSize: 13,
          }}>
            {genError}
          </div>
        )}

        {state.phase === 'input' && (
          <InputPhase onGenerate={handleGenerate} />
        )}

        {state.phase === 'processing' && (
          <ProcessingPhase
            config={state.config}
            jobId={state.jobId}
            onComplete={handleComplete}
            onReset={handleReset}
          />
        )}

        {state.phase === 'results' && (
          <ResultsPhase
            result={state.result}
            config={state.config}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}
