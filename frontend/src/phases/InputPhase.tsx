import { useState, useCallback } from 'react';
import type { GenConfig, TranslationModel, CoverModel, GenParams } from '../types';
import { ModelPills, type ModelDef } from '../components/ModelPills';
import { ParamsPanel } from '../components/ParamsPanel';
import { Waveform } from '../components/Waveform';
import { SectionLabel } from '../components/SectionLabel';

interface InputPhaseProps {
  onGenerate: (config: GenConfig) => void;
}

// Translation: only DPO-finetuned Gemma is wired up today. The pill list
// is a single item so the UI shape stays consistent when we add more later.
const T_MODELS: ModelDef[] = [
  { id: 'gemma-dpo', label: 'DPO Gemma 2B', org: 'Custom', clr: '#d4720d' },
];

// Cover generation: only ACE-Step v1 is wired up. Other engines (v2 fast,
// YourTTS, VALL-E X) are intentionally hidden — re-add to this list when
// the backend actually supports routing to them.
const C_MODELS: ModelDef[] = [
  { id: 'ace1', label: 'ACE-Step v1.5', org: 'ACE-Step', desc: 'XL turbo 5B · lego mode' },
];

// Defaults mirror orchestrator constants (ACE_LEGO_STRENGTH=0.28, anchor
// seed=42, 10 candidates in ACE_CANDIDATES, whisper word-overlap scoring).
const DEF_PARAMS: GenParams = {
  mode: 'lego', seed: 42, strength: 0.28,
  candidates: 10, scoring: 'whisper', threshold: 0.4,
};

function fmt(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InputPhase({ onGenerate }: InputPhaseProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [tModel, setTModel] = useState<TranslationModel>('gemma-dpo');
  const [cModel, setCModel] = useState<CoverModel>('ace1');
  const [params, setParams] = useState<GenParams>(DEF_PARAMS);
  const [showParams, setShowParams] = useState(false);

  const setParam = useCallback((key: keyof GenParams, value: number | string) => {
    setParams(p => ({ ...p, [key]: value }));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.includes('audio') || file.name.endsWith('.wav') || file.name.endsWith('.mp3'))) {
      setAudioFile(file);
    }
  }, []);

  const handleGenerate = () => {
    if (!audioFile || !lyrics.trim()) return;
    onGenerate({ lyrics, tModel, cModel, params, audioFile });
  };

  const canGenerate = !!audioFile && lyrics.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeUp .4s ease both' }}>
      {/* Top 2-column row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Audio drop zone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Audio Source</SectionLabel>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => {
              const inp = document.createElement('input');
              inp.type = 'file';
              inp.accept = 'audio/*';
              inp.onchange = () => {
                const f = inp.files?.[0];
                if (f) setAudioFile(f);
              };
              inp.click();
            }}
            style={{
              flex: 1,
              minHeight: 180,
              borderRadius: 'var(--r2)',
              border: `2px dashed ${dragging ? 'var(--teal)' : audioFile ? 'var(--teal)' : 'var(--border)'}`,
              background: dragging ? 'var(--teal-s)' : audioFile ? 'var(--teal-s)' : 'var(--s1)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 12, cursor: 'pointer', transition: 'all .2s', padding: 20,
            }}
          >
            {audioFile ? (
              <>
                <div style={{ fontSize: 32 }}>🎵</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--teal)', wordBreak: 'break-all' }}>
                    {audioFile.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                    {fmt(audioFile.size)}
                  </div>
                </div>
                <Waveform count={28} color="var(--teal)" height={30} seed={42} />
              </>
            ) : (
              <>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5">
                  <path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM21 16c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
                </svg>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t2)' }}>Drop audio file here</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>MP3 / WAV · up to 10 min</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Lyrics textarea */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Japanese Lyrics</SectionLabel>
          <textarea
            value={lyrics}
            onChange={e => setLyrics(e.target.value)}
            placeholder={'失うものなど何もない\n恐れるものなど何もない\n…'}
            style={{
              flex: 1, minHeight: 180,
              background: 'var(--s1)', border: '1px solid var(--border)',
              borderRadius: 'var(--r2)', color: 'var(--text)',
              padding: 16, fontSize: 14, lineHeight: 1.7,
              fontFamily: "'DM Sans', sans-serif",
              resize: 'vertical', outline: 'none',
              transition: 'border-color .15s',
            }}
            onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--border-hi)'; }}
            onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}
          />
        </div>
      </div>

      {/* Config strip */}
      <div style={{
        background: 'var(--s1)', border: '1px solid var(--border)',
        borderRadius: 'var(--r2)', padding: '16px 20px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <ModelPills models={T_MODELS} selected={tModel} onChange={v => setTModel(v as TranslationModel)} label="Translation Model" />
          <ModelPills models={C_MODELS} selected={cModel} onChange={v => setCModel(v as CoverModel)} label="Cover Generation Model" />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <button
              onClick={() => setShowParams(p => !p)}
              style={{
                padding: '8px 14px', borderRadius: 8, background: showParams ? 'var(--s3)' : 'var(--s2)',
                border: `1px solid ${showParams ? 'var(--border-hi)' : 'var(--border)'}`,
                color: 'var(--t2)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
              </svg>
              Parameters
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: showParams ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
        </div>

        {showParams && (
          <div style={{ animation: 'fadeUp .25s ease both' }}>
            <ParamsPanel p={params} set={setParam} />
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        style={{
          padding: '14px 32px', borderRadius: 'var(--r2)',
          background: canGenerate
            ? 'linear-gradient(135deg, var(--accent), #d4720d)'
            : 'var(--s2)',
          border: `1px solid ${canGenerate ? 'transparent' : 'var(--border)'}`,
          color: canGenerate ? '#fff' : 'var(--t3)',
          fontSize: 15, fontWeight: 600, cursor: canGenerate ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: canGenerate ? '0 4px 24px var(--accent-m)' : 'none',
          transition: 'all .2s', alignSelf: 'stretch',
        }}
        onMouseEnter={e => { if (canGenerate) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM21 16c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
        </svg>
        Generate Cover →
      </button>
    </div>
  );
}
