import { useEffect, useRef, useState } from 'react';

interface AudioWaveformProps {
  audioUrl?: string;
  currentTime: number;
  duration: number;
  /** Called with absolute seconds when the user clicks/drags the waveform. */
  onSeek: (seconds: number) => void;
  /** Number of vertical bars to render. */
  bars?: number;
  /** Pixel height of the waveform area. */
  height?: number;
  /** Color used for the played portion. */
  accent?: string;
  /** Color used for the unplayed portion. */
  trackColor?: string;
}

// Decoded peaks are expensive (a 4-minute WAV takes ~200ms to decode + scan).
// Cache per URL so re-selecting a candidate is instant.
const peaksCache = new Map<string, number[]>();

function computePeaks(audioBuffer: AudioBuffer, bars: number): number[] {
  // Mix all channels to a single mono peak per bucket.
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const samplesPerBar = Math.max(1, Math.floor(length / bars));
  const out: number[] = new Array(bars).fill(0);

  for (let ch = 0; ch < channelCount; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < bars; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      if (max > out[i]) out[i] = max;
    }
  }

  // Normalize so the loudest bar reaches 1.0. Add a tiny floor so silent
  // tracks still draw something visible instead of a flat line.
  const peak = Math.max(...out, 0.001);
  return out.map(v => Math.max(0.04, v / peak));
}

export function AudioWaveform({
  audioUrl,
  currentTime,
  duration,
  onSeek,
  bars = 96,
  height = 64,
  accent = 'var(--accent)',
  trackColor = 'var(--t3)',
}: AudioWaveformProps) {
  const [peaks, setPeaks] = useState<number[] | null>(audioUrl ? peaksCache.get(audioUrl) ?? null : null);
  const [decoding, setDecoding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Decode the audio file once per URL and store the result in the module cache.
  useEffect(() => {
    if (!audioUrl) {
      setPeaks(null);
      return;
    }
    const cached = peaksCache.get(audioUrl);
    if (cached) {
      setPeaks(cached);
      setDecoding(false);
      return;
    }

    let cancelled = false;
    setPeaks(null);
    setDecoding(true);
    console.info('[Waveform] fetching+decoding', audioUrl);

    const ctxClass =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctxClass) {
      console.warn('[Waveform] WebAudio not available; falling back to placeholder bars');
      setDecoding(false);
      return;
    }
    const ctx = new ctxClass();

    (async () => {
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        const result = computePeaks(decoded, bars);
        peaksCache.set(audioUrl, result);
        setPeaks(result);
        console.info('[Waveform] decoded', audioUrl, 'duration=', decoded.duration.toFixed(2), 'peaks=', result.length);
      } catch (err) {
        if (!cancelled) console.error('[Waveform] decode failed', err);
      } finally {
        if (!cancelled) setDecoding(false);
        ctx.close().catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, bars]);

  const hasDuration = isFinite(duration) && duration > 0;
  const progress = hasDuration ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const handlePointer = (clientX: number) => {
    if (!hasDuration) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  // While the audio is decoding (or no audio yet), show flat placeholder bars
  // so the row keeps its height and the user has something visible.
  const displayPeaks: number[] = peaks ?? new Array(bars).fill(0.25);

  return (
    <div
      ref={containerRef}
      onClick={e => handlePointer(e.clientX)}
      onMouseDown={e => {
        // Allow drag-to-scrub: handle initial click + subsequent moves.
        handlePointer(e.clientX);
        const onMove = (ev: MouseEvent) => handlePointer(ev.clientX);
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
      title={hasDuration ? 'クリック / ドラッグでシーク' : decoding ? '波形を解析中…' : ''}
      style={{
        position: 'relative',
        height,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        cursor: hasDuration ? 'pointer' : 'default',
        userSelect: 'none',
        padding: '0 2px',
      }}
    >
      {displayPeaks.map((p, i) => {
        const played = (i + 0.5) / bars <= progress;
        const barHeight = Math.max(4, p * height * 0.9);
        return (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              height: `${barHeight}px`,
              borderRadius: 1,
              background: played ? accent : trackColor,
              opacity: peaks ? (played ? 1 : 0.55) : 0.35,
              transition: 'opacity .1s, background .1s',
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* Playhead — bright vertical line at the current position */}
      {hasDuration && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: `calc(${progress * 100}% - 1px)`,
            width: 2,
            background: 'var(--text)',
            borderRadius: 1,
            pointerEvents: 'none',
            boxShadow: `0 0 6px ${accent}`,
            transition: 'left .08s linear',
          }}
        />
      )}
    </div>
  );
}
