import { useState, useEffect, useRef } from 'react';
import type { GenConfig, JobResult, TranslationRow, SSEEvent } from '../types';
import { useJobStream } from '../hooks/useJobStream';
import { getJobResult } from '../api/client';
import { Waveform } from '../components/Waveform';

interface ProcessingPhaseProps {
  config: GenConfig;
  jobId: string | null;
  onComplete: (result: JobResult) => void;
  onReset: () => void;
}

// Sample data for typewriter animation before real data arrives
const TRANS: TranslationRow[] = [
  { id: 1, ja: '失うものなど何もない', mora: 9, en: 'Nothing left for me to lose' },
  { id: 2, ja: '恐れるものなど何もない', mora: 10, en: 'Nothing here that I should fear' },
  { id: 3, ja: '心の奥に眠る炎', mora: 10, en: 'Deep inside a sleeping flame' },
  { id: 4, ja: 'いつか燃え上がるだろう', mora: 10, en: 'Waiting for its time to blaze' },
  { id: 5, ja: '光を求めて歩き続ける', mora: 12, en: 'Walking on in search of light' },
];

const NOTES = ['♩', '♪', '♫', '♬'];

function FloatingNote({ note, style }: { note: string; style: React.CSSProperties }) {
  return (
    <span style={{
      position: 'absolute', fontSize: 18, color: 'var(--teal)',
      pointerEvents: 'none', opacity: 0,
      animation: 'float 2.4s ease-out forwards',
      ...style,
    }}>
      {note}
    </span>
  );
}

function TypewriterText({ text, speed = 40 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      <span style={{ animation: 'cursor .8s step-end infinite', borderRight: '2px solid var(--teal)', marginLeft: 1 }}>&nbsp;</span>
    </span>
  );
}

export function ProcessingPhase({ config, jobId, onComplete, onReset }: ProcessingPhaseProps) {
  const [stage, setStage] = useState(0); // 0=translation, 1=generation
  const [pct, setPct] = useState(0);
  const [message, setMessage] = useState('Initializing…');
  const [transRows, setTransRows] = useState<TranslationRow[]>(TRANS);
  const [transReady, setTransReady] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCands, setTotalCands] = useState(config.params.candidates);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ id: number; note: string; left: number; delay: number }[]>([]);
  const noteIdRef = useRef(0);

  // Floating notes during translation stage
  useEffect(() => {
    if (stage !== 0) return;
    const id = setInterval(() => {
      noteIdRef.current++;
      setNotes(prev => [
        ...prev.slice(-8),
        {
          id: noteIdRef.current,
          note: NOTES[noteIdRef.current % NOTES.length],
          left: 10 + Math.random() * 80,
          delay: 0,
        },
      ]);
    }, 600);
    return () => clearInterval(id);
  }, [stage]);

  // Pseudo-progress when SSE hasn't arrived yet
  useEffect(() => {
    if (!jobId) {
      const id = setInterval(() => setPct(p => Math.min(p + 1.5, 45)), 200);
      return () => clearInterval(id);
    }
  }, [jobId]);

  // Pseudo candidate fill when in stage 1 with no SSE
  useEffect(() => {
    if (stage !== 1) return;
    const id = setInterval(() => {
      setDoneCount(prev => {
        if (prev >= totalCands) { clearInterval(id); return prev; }
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(id);
  }, [stage, totalCands]);

  useJobStream(jobId, (e: SSEEvent) => {
    if (e.type === 'progress') {
      if (e.pct !== undefined) setPct(e.pct);
      if (e.message) setMessage(e.message);
      if (e.stage === 'ace_step') { setStage(1); }
    } else if (e.type === 'translation_ready') {
      if (e.rows) { setTransRows(e.rows); setTransReady(true); }
      setStage(1);
      setPct(30);
    } else if (e.type === 'candidate_progress') {
      if (e.done !== undefined) setDoneCount(e.done);
      if (e.total !== undefined) setTotalCands(e.total);
    } else if (e.type === 'done') {
      setPct(100);
      if (jobId) {
        getJobResult(jobId).then(onComplete).catch(() => {});
      }
    } else if (e.type === 'error') {
      setErrorMsg(e.message ?? 'Unknown error');
    }
  });

  const stageColor = stage === 0 ? 'var(--teal)' : 'var(--accent)';
  const stageGrad = stage === 0
    ? 'linear-gradient(90deg, var(--teal), #1a9e8a)'
    : 'linear-gradient(90deg, var(--accent), #d4720d)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeUp .4s ease both' }}>
      {/* Stage indicators */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { n: '01', label: 'Translation', active: stage === 0, done: stage > 0 },
          { n: '02', label: 'Generation',  active: stage === 1, done: false },
        ].map(s => (
          <div
            key={s.n}
            style={{
              flex: 1, padding: '14px 18px', borderRadius: 'var(--r)',
              border: `1px solid ${s.active ? stageColor : s.done ? 'var(--border-hi)' : 'var(--border)'}`,
              background: s.active ? `${stage === 0 ? 'var(--teal-s)' : 'var(--accent-s)'}` : 'var(--s1)',
              display: 'flex', alignItems: 'center', gap: 12,
              transition: 'all .3s',
            }}
          >
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
              color: s.active ? stageColor : s.done ? 'var(--t2)' : 'var(--t3)',
            }}>
              {s.done ? '✓' : s.n}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: s.active ? 'var(--text)' : 'var(--t3)' }}>
              {s.label}
            </span>
            {s.active && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 4, height: 4, borderRadius: '50%', background: stageColor,
                    animation: `glowPulse 1s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--t2)' }}>{message}</span>
          <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: stageColor }}>
            {Math.round(pct)}%
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--s3)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 3,
            background: stageGrad,
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s linear infinite',
            transition: 'width .4s ease',
          }} />
        </div>
      </div>

      {errorMsg ? (
        <div style={{
          padding: 20, borderRadius: 'var(--r)', background: '#3a0a0a',
          border: '1px solid #7a2020', color: '#f87171', fontSize: 14,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div>Error: {errorMsg}</div>
          <button
            onClick={onReset}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 16px', borderRadius: 'var(--r)',
              background: 'var(--s2)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer', fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            ← Try Again
          </button>
        </div>
      ) : stage === 0 ? (
        /* Translation stage */
        <div style={{
          background: 'var(--s1)', border: '1px solid var(--border)',
          borderRadius: 'var(--r2)', padding: 20, position: 'relative', overflow: 'hidden', minHeight: 240,
        }}>
          {notes.map(n => (
            <FloatingNote
              key={n.id}
              note={n.note}
              style={{ left: `${n.left}%`, bottom: 20, animationDelay: `${n.delay}s` }}
            />
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {transRows.map((row, i) => (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: 'var(--t2)' }}>{row.ja}</span>
                <span style={{ fontSize: 14, color: 'var(--teal)', fontWeight: 500 }}>
                  {transReady ? row.en : i === 0 ? <TypewriterText text={row.en} /> : <span style={{ color: 'var(--t3)' }}>…</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Generation stage */
        <div style={{
          background: 'var(--s1)', border: '1px solid var(--border)',
          borderRadius: 'var(--r2)', padding: 20,
        }}>
          <div style={{ marginBottom: 20 }}>
            <Waveform playing count={36} color="var(--accent)" height={44} seed={7} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {Array.from({ length: totalCands }, (_, i) => {
              const done = i < doneCount;
              return (
                <div
                  key={i}
                  style={{
                    padding: '10px 0', borderRadius: 8, textAlign: 'center',
                    border: `1px solid ${done ? 'var(--accent)' : 'var(--border)'}`,
                    background: done ? 'var(--accent-s)' : 'var(--s2)',
                    fontSize: 12, fontWeight: 600,
                    color: done ? 'var(--accent)' : 'var(--t3)',
                    transition: 'all .3s',
                    animation: done ? 'pop .25s ease both' : undefined,
                  }}
                >
                  {done ? '✓' : `#${i + 1}`}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Config summary */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap',
        padding: '12px 16px', borderRadius: 'var(--r)',
        background: 'var(--s1)', border: '1px solid var(--border)',
      }}>
        {[
          { k: 'Audio', v: config.audioFile.name },
          { k: 'Translation', v: config.tModel },
          { k: 'Cover model', v: config.cModel },
          { k: 'Mode', v: config.params.mode },
          { k: 'Candidates', v: String(config.params.candidates) },
          { k: 'Seed', v: String(config.params.seed) },
        ].map(({ k, v }) => (
          <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{k}:</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--t2)', fontFamily: "'DM Mono', monospace" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
