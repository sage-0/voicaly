interface SectionLabelProps {
  children: React.ReactNode;
  accent?: string;
}

export function SectionLabel({ children, accent = 'var(--accent)' }: SectionLabelProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: accent }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
        {children}
      </span>
    </div>
  );
}
