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

const NOTES = ['♩', '♪', '♫', '♬'];

// Rotating filler messages used when SSE has not delivered a new message
// in a while (keeps the status line lively even between stages).
const TRANSLATE_FILLER = [
  'モーラ数を整え中…',
  '韻律を最適化中…',
  '英語のリズム感を調整中…',
  'DPO Gemma の判断を待機中…',
];
const GENERATE_FILLER = [
  '候補を合成中…',
  'ボーカル軌跡を解析中…',
  'Whisper で採点中…',
  '伴奏とミキシング中…',
];

function FloatingNote({ note, style }: { note: string; style: React.CSSProperties }) {
  return (
    <span
      style={{
        position: 'absolute',
        fontSize: 18,
        color: 'var(--teal)',
        pointerEvents: 'none',
        opacity: 0,
        animation: 'float 2.4s ease-out forwards',
        ...style,
      }}
    >
      {note}
    </span>
  );
}

function TypewriterText({ text, speed = 24 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      <span
        style={{
          animation: 'cursor .8s step-end infinite',
          borderRight: '2px solid var(--teal)',
          marginLeft: 1,
        }}
      >
        &nbsp;
      </span>
    </span>
  );
}

export function ProcessingPhase({ config, jobId, onComplete, onReset }: ProcessingPhaseProps) {
  const [stage, setStage] = useState(0); // 0 = translation, 1 = generation
  const [pct, setPct] = useState(0);
  const [serverMsg, setServerMsg] = useState<string>('Initializing…');
  const [fillerIdx, setFillerIdx] = useState(0);
  // Lines stream in via SSE; the latest one gets the typewriter cursor.
  const [transRows, setTransRows] = useState<TranslationRow[]>([]);
  const [translateTotal, setTranslateTotal] = useState<number>(0);
  const [latestLineId, setLatestLineId] = useState<number | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCands, setTotalCands] = useState(config.params.candidates);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ id: number; note: string; left: number }[]>([]);
  const noteIdRef = useRef(0);

  // ── Floating notes while translation is running ───────────────────────────
  useEffect(() => {
    if (stage !== 0) return;
    const id = setInterval(() => {
      noteIdRef.current += 1;
      setNotes(prev => [
        ...prev.slice(-8),
        {
          id: noteIdRef.current,
          note: NOTES[noteIdRef.current % NOTES.length],
          left: 8 + Math.random() * 84,
        },
      ]);
    }, 700);
    return () => clearInterval(id);
  }, [stage]);

  // ── Filler-message rotation when no fresh SSE message has arrived ─────────
  useEffect(() => {
    const id = setInterval(() => setFillerIdx(i => i + 1), 2200);
    return () => clearInterval(id);
  }, []);

  // ── Pseudo candidate fill so the grid still ticks during ACE-Step
  //    (orchestrator doesn't emit per-candidate progress yet). ───────────────
  useEffect(() => {
    if (stage !== 1) return;
    const id = setInterval(() => {
      setDoneCount(prev => (prev >= totalCands ? prev : prev + 1));
    }, 1800);
    return () => clearInterval(id);
  }, [stage, totalCands]);

  // ── Stream consumer ───────────────────────────────────────────────────────
  useJobStream(jobId, (e: SSEEvent) => {
    console.info('[SSE]', e.type, e);

    if (e.type === 'progress') {
      if (typeof e.pct === 'number') setPct(e.pct * 100);
      if (e.message) setServerMsg(e.message);
      if (e.stage === 'ace_step') setStage(1);
      else if (e.stage === 'translate' || e.stage === 'translate_line' || e.stage === 'separate') {
        setStage(0);
      }
    } else if (e.type === 'translation_line') {
      if (e.row) {
        const row = e.row;
        setTransRows(prev => {
          const exists = prev.findIndex(r => r.id === row.id);
          if (exists >= 0) {
            const next = [...prev];
            next[exists] = row;
            return next;
          }
          return [...prev, row];
        });
        setLatestLineId(row.id);
      }
      if (typeof e.total === 'number') setTranslateTotal(e.total);
    } else if (e.type === 'translation_ready') {
      if (e.rows) setTransRows(e.rows);
      // Translation done → move to generation stage UI.
      setStage(1);
    } else if (e.type === 'candidate_progress') {
      if (typeof e.done === 'number') setDoneCount(e.done);
      if (typeof e.total === 'number') setTotalCands(e.total);
    } else if (e.type === 'done') {
      setPct(100);
      if (jobId) {
        getJobResult(jobId)
          .then(result => {
            console.info('[API] result loaded', result);
            onComplete(result);
          })
          .catch(err => {
            console.error('[API] result fetch failed', err);
            setErrorMsg(String(err));
          });
      }
    } else if (e.type === 'error') {
      console.error('[SSE] pipeline error', e.message);
      setErrorMsg(e.message ?? 'Unknown error');
    }
  });

  const stageColor = stage === 0 ? 'var(--teal)' : 'var(--accent)';
  const stageGrad =
    stage === 0
      ? 'linear-gradient(90deg, var(--teal), #1a9e8a)'
      : 'linear-gradient(90deg, var(--accent), #d4720d)';

  // Pick filler text only when there's no fresh server message
  const fillerSet = stage === 0 ? TRANSLATE_FILLER : GENERATE_FILLER;
  const filler = fillerSet[fillerIdx % fillerSet.length];
  const message = serverMsg && serverMsg !== 'Initializing…' ? serverMsg : filler;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeUp .4s ease both' }}>
      {/* Stage indicators */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { n: '01', label: 'Translation', active: stage === 0, done: stage > 0 },
          { n: '02', label: 'Generation', active: stage === 1, done: false },
        ].map(s => (
          <div
            key={s.n}
            style={{
              flex: 1,
              padding: '14px 18px',
              borderRadius: 'var(--r)',
              border: `1px solid ${s.active ? stageColor : s.done ? 'var(--border-hi)' : 'var(--border)'}`,
              background: s.active ? (stage === 0 ? 'var(--teal-s)' : 'var(--accent-s)') : 'var(--s1)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transition: 'all .3s',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "'DM Mono', monospace",
                color: s.active ? stageColor : s.done ? 'var(--t2)' : 'var(--t3)',
              }}
            >
              {s.done ? '✓' : s.n}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: s.active ? 'var(--text)' : 'var(--t3)' }}>
              {s.label}
            </span>
            {s.active && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: stageColor,
                      animation: `glowPulse 1s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Progress bar with rotating status message */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            key={message /* re-mount on each message change for a fade-in */}
            style={{ fontSize: 13, color: 'var(--t2)', animation: 'fadeIn .25s ease both' }}
          >
            {message}
          </span>
          <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: stageColor }}>
            {Math.round(pct)}%
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--s3)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 3,
              background: stageGrad,
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
              transition: 'width .4s ease',
            }}
          />
        </div>
      </div>

      {errorMsg ? (
        <div
          style={{
            padding: 20,
            borderRadius: 'var(--r)',
            background: '#3a0a0a',
            border: '1px solid #7a2020',
            color: '#f87171',
            fontSize: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div>Error: {errorMsg}</div>
          <button
            onClick={onReset}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 16px',
              borderRadius: 'var(--r)',
              background: 'var(--s2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            ← Try Again
          </button>
        </div>
      ) : stage === 0 ? (
        /* Translation stage — live per-line stream from DPO Gemma. */
        <div
          style={{
            background: 'var(--s1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r2)',
            padding: 20,
            position: 'relative',
            overflow: 'hidden',
            minHeight: 240,
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          {notes.map(n => (
            <FloatingNote key={n.id} note={n.note} style={{ left: `${n.left}%`, bottom: 16 }} />
          ))}

          {transRows.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200,
                color: 'var(--t3)',
                fontSize: 13,
              }}
            >
              翻訳中…
              {translateTotal > 0 && (
                <span style={{ marginLeft: 8, fontFamily: "'DM Mono', monospace" }}>
                  (0 / {translateTotal})
                </span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {transRows.map(row => (
                <div
                  key={row.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                    alignItems: 'baseline',
                    animation: 'fadeUp .25s ease both',
                  }}
                >
                  <span style={{ fontSize: 14, color: 'var(--t2)' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        minWidth: 22,
                        color: 'var(--t3)',
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 11,
                      }}
                    >
                      {row.id}.
                    </span>
                    {row.ja}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--teal)', fontWeight: 500 }}>
                    {row.id === latestLineId ? <TypewriterText text={row.en} /> : row.en}
                  </span>
                </div>
              ))}
              {translateTotal > 0 && transRows.length < translateTotal && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--t3)',
                    fontFamily: "'DM Mono', monospace",
                    marginTop: 4,
                  }}
                >
                  {transRows.length} / {translateTotal} 行翻訳済み…
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Generation stage — waveform + candidate grid. */
        <div
          style={{
            background: 'var(--s1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r2)',
            padding: 20,
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <Waveform playing count={36} color="var(--accent)" height={44} seed={7} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {Array.from({ length: totalCands }, (_, i) => {
              const done = i < doneCount;
              return (
                <div
                  key={i}
                  style={{
                    padding: '10px 0',
                    borderRadius: 8,
                    textAlign: 'center',
                    border: `1px solid ${done ? 'var(--accent)' : 'var(--border)'}`,
                    background: done ? 'var(--accent-s)' : 'var(--s2)',
                    fontSize: 12,
                    fontWeight: 600,
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
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 16px',
          borderRadius: 'var(--r)',
          background: 'var(--s1)',
          border: '1px solid var(--border)',
        }}
      >
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
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--t2)',
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
