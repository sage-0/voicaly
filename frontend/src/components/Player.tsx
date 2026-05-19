import { useRef, useEffect } from 'react';
import { Waveform } from './Waveform';

interface PlayerProps {
  label?: string;
  playing: boolean;
  onToggle: () => void;
  progress?: number;
  duration?: string;
  seed?: number;
  accent?: string;
  audioUrl?: string;
}

export function Player({
  label = 'Audio',
  playing,
  onToggle,
  progress = 0,
  duration = '0:00',
  seed = 0,
  accent = 'var(--accent)',
  audioUrl,
}: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [playing]);

  return (
    <div style={{
      background: 'var(--s2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r2)',
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <a
          href={audioUrl ?? '#'}
          download
          onClick={!audioUrl ? (e) => e.preventDefault() : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--t3)', textDecoration: 'none',
            padding: '4px 10px', borderRadius: 6,
            border: '1px solid var(--border)',
            transition: 'color .15s, border-color .15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hi)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Download
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={onToggle}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: accent, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: `0 0 16px ${accent}55`,
            transition: 'transform .1s, box-shadow .1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          )}
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Waveform playing={playing} count={40} color={accent} height={36} seed={seed} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--s3)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress * 100}%`,
                background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                borderRadius: 2,
                transition: 'width .3s',
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
              {duration}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
