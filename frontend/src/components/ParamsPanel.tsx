import type { GenParams } from '../types';

interface ParamsPanelProps {
  p: GenParams;
  set: (key: keyof GenParams, value: number | string) => void;
}

function SliderRow({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: "'DM Mono', monospace" }}>
          {fmt ? fmt(value) : value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
    </div>
  );
}

export function ParamsPanel({ p, set }: ParamsPanelProps) {
  const randomSeed = () => set('seed', Math.floor(Math.random() * 99999));

  return (
    <div style={{
      background: 'var(--s1)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r2)',
      padding: 20,
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 20,
    }}>
      {/* Mode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>Mode</span>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {(['lego', 'standard'] as const).map(m => (
            <button
              key={m}
              onClick={() => set('mode', m)}
              style={{
                flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500, border: 'none',
                cursor: 'pointer', textTransform: 'capitalize',
                background: p.mode === m ? 'var(--accent)' : 'var(--s2)',
                color: p.mode === m ? '#fff' : 'var(--t2)',
                transition: 'all .15s',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Candidates */}
      <SliderRow
        label="Candidates"
        value={p.candidates}
        min={1} max={16} step={1}
        onChange={v => set('candidates', v)}
      />

      {/* Strength */}
      <SliderRow
        label="Strength"
        value={p.strength}
        min={0} max={1} step={0.05}
        onChange={v => set('strength', v)}
        fmt={v => v.toFixed(2)}
      />

      {/* Seed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>Seed</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="number" value={p.seed}
            onChange={e => set('seed', Number(e.target.value))}
            style={{
              flex: 1, background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', padding: '6px 10px',
              fontSize: 13, fontFamily: "'DM Mono', monospace",
            }}
          />
          <button
            onClick={randomSeed}
            title="Random seed"
            style={{
              padding: '6px 10px', borderRadius: 6, background: 'var(--s2)',
              border: '1px solid var(--border)', color: 'var(--t2)', cursor: 'pointer',
              fontSize: 14, transition: 'color .15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
          >
            ⚄
          </button>
        </div>
      </div>

      {/* Score threshold */}
      <SliderRow
        label="Score Threshold"
        value={p.threshold}
        min={0} max={1} step={0.05}
        onChange={v => set('threshold', v)}
        fmt={v => v.toFixed(2)}
      />

      {/* Scoring mode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>Scoring</span>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {(['whisper', 'ear', 'both'] as const).map(s => (
            <button
              key={s}
              onClick={() => set('scoring', s)}
              style={{
                flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 500, border: 'none',
                cursor: 'pointer', textTransform: 'capitalize',
                background: p.scoring === s ? 'var(--teal)' : 'var(--s2)',
                color: p.scoring === s ? '#fff' : 'var(--t2)',
                transition: 'all .15s',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
