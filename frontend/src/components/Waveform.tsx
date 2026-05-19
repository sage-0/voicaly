interface WaveformProps {
  playing?: boolean;
  count?: number;
  color?: string;
  height?: number;
  seed?: number;
}

export function Waveform({ playing = false, count = 32, color = 'var(--accent)', height = 40, seed = 0 }: WaveformProps) {
  const bars = Array.from({ length: count }, (_, i) => {
    const h = 18 + Math.sin((i + seed) * 0.7) * 14 + Math.sin((i + seed) * 1.4) * 8;
    return h;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 2,
            background: color,
            transformOrigin: 'center',
            animation: playing
              ? `bar ${0.8 + (i % 5) * 0.15}s ease-in-out ${(i % 7) * 0.08}s infinite`
              : undefined,
            opacity: playing ? 1 : 0.7,
          }}
        />
      ))}
    </div>
  );
}
