import { useState } from 'react';
import type { Preset, PresetCandidate } from '../types';

interface PresetEditorProps {
  preset: Preset;
  onChange: (preset: Preset) => void;
}

function HelpIcon({ title }: { title: string }) {
  return (
    <span className="param-help" title={title}>?</span>
  );
}

function FieldLabel({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: '.07em', textTransform: 'uppercase' }}>
        {children}
      </span>
      <HelpIcon title={help} />
    </div>
  );
}

const DEFAULT_CANDIDATE: PresetCandidate = {
  mode: 'lego',
  seed: 42,
  strength: 0.45,
  vocal_db: 0,
};

export function PresetEditor({ preset, onChange }: PresetEditorProps) {
  const [candidatesOpen, setCandidatesOpen] = useState(true);

  const updateField = <K extends keyof Preset>(key: K, value: Preset[K]) => {
    onChange({ ...preset, [key]: value });
  };

  const updateCandidate = (idx: number, key: keyof PresetCandidate, value: string | number) => {
    const updated = preset.candidates.map((c, i) =>
      i === idx ? { ...c, [key]: value } : c,
    );
    onChange({ ...preset, candidates: updated });
  };

  const removeCandidate = (idx: number) => {
    if (preset.candidates.length <= 1) return;
    onChange({ ...preset, candidates: preset.candidates.filter((_, i) => i !== idx) });
  };

  const addCandidate = () => {
    onChange({ ...preset, candidates: [...preset.candidates, { ...DEFAULT_CANDIDATE }] });
  };

  const postFxDisabled = !preset.post_fx_enabled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Post-FX Section */}
      <div style={{
        background: 'var(--s2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
          Post-FX
        </div>

        {/* post_fx_enabled */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            id="postfx-enabled"
            checked={preset.post_fx_enabled}
            onChange={e => updateField('post_fx_enabled', e.target.checked)}
            style={{ accentColor: 'var(--teal)', width: 15, height: 15, cursor: 'pointer' }}
          />
          <label htmlFor="postfx-enabled" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <FieldLabel help="ACE-Step 出力ボーカルに後処理 (子音強調 + ブレス挿入) を適用する">
              Post-FX 有効
            </FieldLabel>
          </label>
        </div>

        {/* post_fx_consonant_boost_db */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: postFxDisabled ? 0.4 : 1, transition: 'opacity .2s' }}>
          <FieldLabel help="3kHz 以上の高域 transient を強調する量。英語の破裂音 (p, t, k) を際立たせる。大きすぎるとシャリつく">
            子音ブースト (dB)
          </FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number"
              disabled={postFxDisabled}
              min={0.0}
              max={6.0}
              step={0.1}
              value={preset.post_fx_consonant_boost_db}
              onChange={e => updateField('post_fx_consonant_boost_db', parseFloat(e.target.value) || 0)}
              style={{
                width: 80,
                background: 'var(--s1)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                padding: '6px 10px',
                fontSize: 13,
                fontFamily: "'DM Mono', monospace",
                cursor: postFxDisabled ? 'not-allowed' : 'auto',
              }}
            />
            <input
              type="range"
              disabled={postFxDisabled}
              min={0.0}
              max={6.0}
              step={0.1}
              value={preset.post_fx_consonant_boost_db}
              onChange={e => updateField('post_fx_consonant_boost_db', parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--teal)', cursor: postFxDisabled ? 'not-allowed' : 'pointer' }}
            />
          </div>
        </div>

        {/* post_fx_breath_level_db */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: postFxDisabled ? 0.4 : 1, transition: 'opacity .2s' }}>
          <FieldLabel help="フレーズ間の無音区間に合成ブレスを overlay する音量。-28 dBFS 付近が自然">
            ブレス音量 (dBFS)
          </FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number"
              disabled={postFxDisabled}
              min={-50}
              max={-20}
              step={1}
              value={preset.post_fx_breath_level_db}
              onChange={e => updateField('post_fx_breath_level_db', parseInt(e.target.value, 10) || 0)}
              style={{
                width: 80,
                background: 'var(--s1)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                padding: '6px 10px',
                fontSize: 13,
                fontFamily: "'DM Mono', monospace",
                cursor: postFxDisabled ? 'not-allowed' : 'auto',
              }}
            />
            <input
              type="range"
              disabled={postFxDisabled}
              min={-50}
              max={-20}
              step={1}
              value={preset.post_fx_breath_level_db}
              onChange={e => updateField('post_fx_breath_level_db', parseInt(e.target.value, 10))}
              style={{ flex: 1, accentColor: 'var(--teal)', cursor: postFxDisabled ? 'not-allowed' : 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* Candidates Section */}
      <div style={{
        background: 'var(--s2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        overflow: 'hidden',
      }}>
        {/* Accordion header */}
        <button
          onClick={() => setCandidatesOpen(o => !o)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--t2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
              Candidates
            </span>
            <HelpIcon title="best-of-N で生成する候補のリスト。複数試して耳でベスト選択する" />
            <span style={{
              fontSize: 11,
              background: 'var(--s3)',
              color: 'var(--t3)',
              borderRadius: 10,
              padding: '1px 8px',
              marginLeft: 4,
            }}>
              {preset.candidates.length}
            </span>
          </div>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ transform: candidatesOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {candidatesOpen && (
          <div style={{ borderTop: '1px solid var(--border)', animation: 'fadeUp .2s ease both' }}>
            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--s3)' }}>
                    {[
                      { label: '#', help: '' },
                      { label: 'mode', help: 'ACE-Step のタスク。lego は src_audio をリファレンスにメロディを引き継いで歌う' },
                      { label: 'seed', help: '乱数シード。同じ seed なら原理的に同じ出力が出る (再現性確保)' },
                      { label: 'strength', help: 'audio_cover_strength: 元音源を参照する強さ。高いほどメロディに忠実だが日本語音素が漏れやすい。低いほど英語発音が成立するが読み上げ寄りに' },
                      { label: 'vocal_db', help: 'src_audio に渡す日本語ボーカルの減衰量 (dB)。0=フル音源 (FINAL_v6dB 同条件)。-6 = 半分、-12 = 1/4。下げるほど音素漏洩は減るがメロディ追従が弱まる' },
                      { label: '', help: '' },
                    ].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '8px 10px',
                          textAlign: 'left',
                          fontWeight: 600,
                          color: 'var(--t3)',
                          letterSpacing: '.07em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h.label && (
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                            {h.label}
                            {h.help && <HelpIcon title={h.help} />}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preset.candidates.map((c, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderTop: '1px solid var(--border)',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--s1)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {/* # */}
                      <td style={{ padding: '8px 10px', color: 'var(--t3)', fontFamily: "'DM Mono', monospace" }}>
                        {idx + 1}
                      </td>
                      {/* mode */}
                      <td style={{ padding: '6px 10px' }}>
                        <select
                          value={c.mode}
                          onChange={e => updateCandidate(idx, 'mode', e.target.value)}
                          style={{
                            background: 'var(--s1)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            color: 'var(--text)',
                            fontSize: 12,
                            padding: '5px 8px',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="lego">lego</option>
                          <option value="cover">cover</option>
                        </select>
                      </td>
                      {/* seed */}
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="number"
                          value={c.seed}
                          onChange={e => updateCandidate(idx, 'seed', parseInt(e.target.value, 10) || 0)}
                          style={{
                            width: 80,
                            background: 'var(--s1)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            color: 'var(--text)',
                            padding: '5px 8px',
                            fontSize: 12,
                            fontFamily: "'DM Mono', monospace",
                          }}
                        />
                      </td>
                      {/* strength */}
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="number"
                          min={0.0}
                          max={1.0}
                          step={0.01}
                          value={c.strength}
                          onChange={e => updateCandidate(idx, 'strength', parseFloat(e.target.value) || 0)}
                          style={{
                            width: 80,
                            background: 'var(--s1)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            color: 'var(--text)',
                            padding: '5px 8px',
                            fontSize: 12,
                            fontFamily: "'DM Mono', monospace",
                          }}
                        />
                      </td>
                      {/* vocal_db */}
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="number"
                          min={-24}
                          max={0}
                          step={1}
                          value={c.vocal_db}
                          onChange={e => updateCandidate(idx, 'vocal_db', parseInt(e.target.value, 10) || 0)}
                          style={{
                            width: 80,
                            background: 'var(--s1)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            color: 'var(--text)',
                            padding: '5px 8px',
                            fontSize: 12,
                            fontFamily: "'DM Mono', monospace",
                          }}
                        />
                      </td>
                      {/* delete */}
                      <td style={{ padding: '6px 10px' }}>
                        <button
                          onClick={() => removeCandidate(idx)}
                          disabled={preset.candidates.length <= 1}
                          title={preset.candidates.length <= 1 ? '最後の候補は削除できません' : 'この候補を削除'}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            color: preset.candidates.length <= 1 ? 'var(--t3)' : '#f87171',
                            cursor: preset.candidates.length <= 1 ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            opacity: preset.candidates.length <= 1 ? 0.4 : 1,
                            transition: 'all .15s',
                          }}
                          onMouseEnter={e => {
                            if (preset.candidates.length > 1)
                              (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,.15)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add candidate button */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={addCandidate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: 'var(--s1)',
                  border: '1px dashed var(--border)',
                  color: 'var(--t2)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hi)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--t2)';
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add candidate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
