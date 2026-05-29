import { useState, useCallback, useEffect } from 'react';
import type { GenConfig, TranslationModel, CoverModel, GenParams, Preset } from '../types';
import { listPresets } from '../api/client';
import { ModelPills, type ModelDef } from '../components/ModelPills';
import { PresetEditor } from '../components/PresetEditor';
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

// Used as a safe fallback before the backend returns a preset list, and when
// the selected preset id is not found in the list (e.g. the backend is still
// booting). Mirrors "builtin-postfx-enhanced" defaults.
const FALLBACK_PRESET: Preset = {
  id: 'builtin-postfx-enhanced',
  name: 'PostFX Enhanced (Builtin)',
  builtin: true,
  created_at: '',
  candidates: [{ mode: 'lego', seed: 42, strength: 0.28, vocal_db: 0 }],
  post_fx_enabled: true,
  post_fx_consonant_boost_db: 3,
  post_fx_breath_level_db: -12,
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
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('builtin-postfx-enhanced');
  const [editedPreset, setEditedPreset] = useState<Preset | null>(null);
  const [showPresetEditor, setShowPresetEditor] = useState(false);

  useEffect(() => {
    listPresets().then(list => {
      setPresets(list);
      // initialize editedPreset from the default selection
      const found = list.find(p => p.id === 'builtin-postfx-enhanced') ?? list[0];
      if (found) setEditedPreset(JSON.parse(JSON.stringify(found)));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const found = presets.find(p => p.id === selectedPresetId);
    if (found) setEditedPreset(JSON.parse(JSON.stringify(found)));
  }, [selectedPresetId, presets]);

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
    const preset = editedPreset ?? presets.find(p => p.id === selectedPresetId) ?? presets[0] ?? FALLBACK_PRESET;
    // Build GenParams from the first candidate so existing ProcessingPhase/API code still works.
    const firstCand = preset.candidates[0];
    const params: GenParams = {
      mode: (firstCand.mode === 'cover' ? 'standard' : 'lego') as GenParams['mode'],
      seed: firstCand.seed,
      strength: firstCand.strength,
      candidates: preset.candidates.length,
      scoring: 'whisper',
      threshold: 0.4,
    };
    onGenerate({ lyrics, tModel, cModel, params, audioFile, preset });
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

          {/* Preset selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Preset
              </span>
              <span
                className="param-help"
                data-tooltip="ACE-Step に渡すモデル・サンプラー設定・候補リスト・後処理設定の組合せ。曲のジャンルや品質要件に応じて切り替えます。各プリセットの内容は下の Edit Preset で確認・編集できます"
                title="ACE-Step に渡すモデル・サンプラー設定・候補リスト・後処理設定の組合せ。曲のジャンルや品質要件に応じて切り替えます"
              >?</span>
            </div>
            <select
              value={selectedPresetId}
              onChange={e => setSelectedPresetId(e.target.value)}
              style={{
                background: 'var(--s2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 500,
                padding: '7px 28px 7px 12px',
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 10px center',
                minWidth: 200,
                transition: 'border-color .15s',
              }}
              onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--border-hi)'; }}
              onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              {presets.length === 0 ? (
                <option value={FALLBACK_PRESET.id}>{FALLBACK_PRESET.name} (Builtin)</option>
              ) : (
                presets.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.builtin ? ' (Builtin)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <button
              onClick={() => setShowPresetEditor(p => !p)}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: showPresetEditor ? 'var(--s3)' : 'var(--s2)',
                border: `1px solid ${showPresetEditor ? 'var(--border-hi)' : 'var(--border)'}`,
                color: 'var(--t2)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
              </svg>
              Edit Preset
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: showPresetEditor ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
        </div>

        {showPresetEditor && editedPreset && (
          <div style={{ animation: 'fadeUp .25s ease both' }}>
            <PresetEditor preset={editedPreset} onChange={setEditedPreset} />
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
