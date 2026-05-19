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

  // Track the latest `playing` value via a ref so the audioUrl-change effect
  // can resume playback without re-firing every time `playing` toggles.
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // When the audio source changes (user picks a different candidate), the
  // <audio> element keeps the old buffered data until we call .load(). After
  // load() the element resets to paused — so if we WERE playing, restart it.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    console.info('[Player] audioUrl changed →', audioUrl);
    a.load();
    setCurrentTime(0);
    setDuration(0);
    if (audioUrl && playingRef.current) {
      // play() returns a Promise; the browser waits for canplay internally.
      a.play().catch(err => console.warn('[Player] post-load play() rejected:', err));
    }
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
        setCurrentTime(target);
      },
      getDuration: () => audioRef.current?.duration ?? 0,
    }),
    [],
  );

  const onProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !isFinite(duration) || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = ratio * duration;
    a.currentTime = t;
    setCurrentTime(t);
    console.info('[Player] progress-bar seek →', t.toFixed(2), 's');
  };

  const hasDuration = isFinite(duration) && duration > 0;
  const progress = hasDuration ? Math.min(1, currentTime / duration) : 0;

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
          onLoadedMetadata={e => {
            const d = (e.currentTarget as HTMLAudioElement).duration;
            console.info('[Player] loadedmetadata duration =', d);
            setDuration(d);
          }}
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

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Waveform playing={playing} count={40} color={accent} height={36} seed={seed} />

          {/* Seek bar — taller and on a lighter track so it stays visible
              even before the audio metadata loads. A round thumb gives the
              user something to grab/aim at when seeking. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={onProgressBarClick}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: 'var(--border)',
                cursor: hasDuration ? 'pointer' : 'default',
                position: 'relative',
              }}
              title={hasDuration ? 'クリックでシーク' : '音声を読み込み中…'}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${progress * 100}%`,
                  background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                  borderRadius: 3,
                  transition: 'width .1s linear',
                  pointerEvents: 'none',
                }}
              />
              {/* Thumb — always rendered so the bar is clearly a slider */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: `${progress * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: accent,
                  border: '2px solid var(--bg)',
                  boxShadow: `0 0 6px ${accent}aa`,
                  pointerEvents: 'none',
                  transition: 'left .1s linear',
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                color: 'var(--t2)',
                fontFamily: "'DM Mono', monospace",
                flexShrink: 0,
                minWidth: 90,
                textAlign: 'right',
              }}
            >
              {fmtTime(currentTime)} / {hasDuration ? fmtTime(duration) : '—:—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
