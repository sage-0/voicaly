export interface ModelDef {
  id: string;
  label: string;
  org: string;
  clr?: string;
  desc?: string;
}

interface ModelPillsProps {
  models: ModelDef[];
  selected: string;
  onChange: (id: string) => void;
  label: string;
}

export function ModelPills({ models, selected, onChange, label }: ModelPillsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {models.map((m) => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              title={m.desc}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${active ? (m.clr ?? 'var(--accent)') : 'var(--border)'}`,
                background: active ? `${m.clr ?? 'var(--accent)'}18` : 'var(--s2)',
                cursor: 'pointer',
                transition: 'all .15s',
                minWidth: 110,
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hi)';
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              }}
            >
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: active ? (m.clr ?? 'var(--accent)') : 'var(--text)',
                lineHeight: 1.3,
              }}>
                {m.label}
              </span>
              <span style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>
                {m.org}
              </span>
              {m.desc && (
                <span style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>
                  {m.desc}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
