import { useState } from 'react';
import type { Preset, PresetCandidate } from '../types';

interface PresetEditorProps {
  preset: Preset;
  onChange: (preset: Preset) => void;
}

function HelpIcon({ title }: { title: string }) {
  // Use a CSS-only tooltip via data-tooltip + ::after (defined in App.css)
  // instead of the native HTML title attribute, which has a long browser
  // delay (~1s) and can't be styled. The native title is kept as a fallback
  // for accessibility / non-JS clients.
  return (
    <span className="param-help" data-tooltip={title} title={title}>?</span>
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
  const [aceOpen, setAceOpen] = useState(true);

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

  // Resolved values with backend defaults for old presets that lack the new fields
  const aceConfig = preset.ace_config ?? 'acestep-v15-turbo';
  const steps = preset.inference_steps ?? 16;
  const shiftVal = preset.shift ?? 1.0;
  const cfgStart = preset.cfg_interval_start ?? 0.0;
  const cfgEnd = preset.cfg_interval_end ?? 1.0;
  const guidance = preset.guidance_scale ?? 7.0;
  const captionStyle = preset.caption_style ?? 'baseline';
  const srcKind = preset.src_kind ?? 'full';

  const inputStyle: React.CSSProperties = {
    width: 90,
    background: 'var(--s1)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: "'DM Mono', monospace",
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ACE-Step Model + Sampler Section */}
      <div style={{
        background: 'var(--s2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setAceOpen(o => !o)}
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
              ACE-Step モデル & サンプラー
            </span>
            <HelpIcon title="どの ACE-Step モデルを使い、ノイズ除去のサンプラーをどう動かすか。曲のジャンルに応じて使い分ける" />
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
               style={{ transform: aceOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {aceOpen && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            animation: 'fadeUp .2s ease both',
          }}>
            {/* ace_config */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel help="ACE-Step のモデル選択。turbo (2B) は最速・標準 J-pop 向け。xl-turbo (5B) はより明瞭な英語発音。sft (非蒸留) は最高品質だが steps=50 推奨で約2倍遅い。OOD 楽曲では sft が安定する傾向">
                モデル
              </FieldLabel>
              <select
                value={aceConfig}
                onChange={e => updateField('ace_config', e.target.value)}
                style={{
                  background: 'var(--s1)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text)', fontSize: 13,
                  padding: '6px 10px', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="acestep-v15-turbo">acestep-v15-turbo (2B, 高速)</option>
                <option value="acestep-v15-xl-turbo">acestep-v15-xl-turbo (5B, 明瞭発音)</option>
                <option value="acestep-v15-sft">acestep-v15-sft (非蒸留, 最高品質・低速)</option>
              </select>
            </div>

            {/* inference_steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel help="拡散モデルが波形を仕上げる反復回数。turbo は 16-24 で十分、sft は 50 推奨。多いほど高品質だが線形に遅くなる">
                推論ステップ数
              </FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" min={4} max={100} step={1} value={steps}
                  onChange={e => updateField('inference_steps', parseInt(e.target.value, 10) || 16)}
                  style={inputStyle} />
                <input type="range" min={4} max={100} step={1} value={steps}
                  onChange={e => updateField('inference_steps', parseInt(e.target.value, 10))}
                  style={{ flex: 1, accentColor: 'var(--teal)', cursor: 'pointer' }} />
              </div>
            </div>

            {/* shift */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel help="ノイズスケジュールの傾き。1.0 が均等。値を上げる (2.0-2.5) と前半 (semantic な構造作り) に重みが乗り、「うーうー」が減って子音が明瞭になる。3.0 以上は逆効果になりやすい">
                shift
              </FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" min={0.5} max={4.0} step={0.1} value={shiftVal}
                  onChange={e => updateField('shift', parseFloat(e.target.value) || 1.0)}
                  style={inputStyle} />
                <input type="range" min={0.5} max={4.0} step={0.1} value={shiftVal}
                  onChange={e => updateField('shift', parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--teal)', cursor: 'pointer' }} />
              </div>
            </div>

            {/* guidance_scale */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel help="Classifier-Free Guidance の強さ。7.0 標準。上げる (8-10) と caption/歌詞への追従が強くなるが、過剰だとロボットっぽくなる。5-6 だと自然だが指示が弱い">
                guidance_scale
              </FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" min={1.0} max={15.0} step={0.5} value={guidance}
                  onChange={e => updateField('guidance_scale', parseFloat(e.target.value) || 7.0)}
                  style={inputStyle} />
                <input type="range" min={1.0} max={15.0} step={0.5} value={guidance}
                  onChange={e => updateField('guidance_scale', parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--teal)', cursor: 'pointer' }} />
              </div>
            </div>

            {/* cfg_interval */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel help="CFG (guidance) を適用するノイズステップの範囲 (0.0-1.0)。デフォルトは全区間 [0, 1]。終端を 0.7-0.8 に下げると、後半に CFG を切ることで子音歪み・ノイズが減る">
                cfg_interval [開始, 終了]
              </FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" min={0.0} max={1.0} step={0.05} value={cfgStart}
                  onChange={e => updateField('cfg_interval_start', parseFloat(e.target.value) || 0.0)}
                  style={inputStyle} />
                <span style={{ color: 'var(--t3)' }}>〜</span>
                <input type="number" min={0.0} max={1.0} step={0.05} value={cfgEnd}
                  onChange={e => updateField('cfg_interval_end', parseFloat(e.target.value) || 1.0)}
                  style={inputStyle} />
              </div>
            </div>

            {/* caption_style */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel help="モデルに渡す英語キャプション。baseline = 「原曲メロディに乗せて歌う」標準。articulation = 「子音を強調、母音を一つずつ発音」と明示して英語明瞭度を上げる。「うーうー」が気になるなら articulation">
                キャプションスタイル
              </FieldLabel>
              <select
                value={captionStyle}
                onChange={e => updateField('caption_style', e.target.value as 'baseline' | 'articulation')}
                style={{
                  background: 'var(--s1)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text)', fontSize: 13,
                  padding: '6px 10px', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="baseline">baseline (標準)</option>
                <option value="articulation">articulation (明瞭発音強調)</option>
              </select>
            </div>

            {/* src_kind */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FieldLabel help="ACE-Step に渡す src_audio の種類。full = アップロードした音源そのまま (標準)。vocals = Demucs で分離した日本語ボーカル単独。vocals はピッチ追従が劇的に上がるが、日本語音素が漏れやすく声質が荒くなる — Niki『lower』のような OOD 楽曲でのみ推奨">
                src_audio の種類
              </FieldLabel>
              <select
                value={srcKind}
                onChange={e => updateField('src_kind', e.target.value as 'full' | 'vocals')}
                style={{
                  background: 'var(--s1)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text)', fontSize: 13,
                  padding: '6px 10px', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="full">full (フル音源)</option>
                <option value="vocals">vocals (分離ボーカルのみ)</option>
              </select>
            </div>
          </div>
        )}
      </div>

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
