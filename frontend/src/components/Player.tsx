import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Waveform } from './Waveform';

interface PlayerProps {
  label?: string;
  playing: boolean;
  onToggle: () => void;
  seed?: number;
  accent?: string;
  audioUrl?: string;
}

export interface PlayerHandle {
  /** Jump to a specific absolute time (seconds). Clamps to [0, duration]. */
  seekTo: (time: number) => void;
  /** Current loaded media duration in seconds (0 if not loaded). */
  getDuration: () => number;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export const Player = forwardRef<PlayerHandle, PlayerProps>(function Player(
  { label = 'Audio', playing, onToggle, seed = 0, accent = 'var(--accent)', audioUrl },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // React updates the <audio src> attribute when audioUrl changes, but the
  // element does not automatically reload — call .load() explicitly. Without
  // this, clicking a different candidate continues playing the previous one.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    console.info('[Player] audioUrl changed →', audioUrl);
    a.load();
    setCurrentTime(0);
    setDuration(0);
  }, [audioUrl]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.play().catch(err => console.warn('[Player] play() rejected:', err));
    } else {
      a.pause();
    }
  }, [playing]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo: (t: number) => {
        const a = audioRef.current;
        if (!a) return;
        const d = a.duration;
        const target = isFinite(d) && d > 0 ? Math.max(0, Math.min(t, d)) : Math.max(0, t);
        console.info('[Player] seekTo', t.toFixed(2), '→ clamped', target.toFixed(2));
        a.currentTime = target;
      },
      getDuration: () => audioRef.current?.duration ?? 0,
    }),
    [],
  );

  const onProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration || !isFinite(duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    console.info('[Player] progress-bar seek →', (ratio * duration).toFixed(2), 's');
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      style={{
        background: 'var(--s2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r2)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={e => setCurrentTime((e.currentTarget as HTMLAudioElement).currentTime)}
          onLoadedMetadata={e => setDuration((e.currentTarget as HTMLAudioElement).duration)}
          onDurationChange={e => setDuration((e.currentTarget as HTMLAudioElement).duration)}
          onEnded={() => console.info('[Player] playback ended')}
          onError={e => console.error('[Player] audio error', (e.currentTarget as HTMLAudioElement).error)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--t2)',
            letterSpacing: '.04em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <a
          href={audioUrl ?? '#'}
          download
          onClick={!audioUrl ? e => e.preventDefault() : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--t3)',
            textDecoration: 'none',
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            transition: 'color .15s, border-color .15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hi)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--t3)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Download
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={onToggle}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: accent,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: `0 0 16px ${accent}55`,
            transition: 'transform .1s, box-shadow .1s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
          }}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Waveform playing={playing} count={40} color={accent} height={36} seed={seed} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              onClick={onProgressBarClick}
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                background: 'var(--s3)',
                overflow: 'hidden',
                cursor: duration > 0 ? 'pointer' : 'default',
                position: 'relative',
              }}
              title={duration > 0 ? 'クリックでシーク' : undefined}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress * 100}%`,
                  background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                  borderRadius: 4,
                  transition: 'width .1s linear',
                  pointerEvents: 'none',
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                color: 'var(--t3)',
                fontFamily: "'DM Mono', monospace",
                flexShrink: 0,
              }}
            >
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
