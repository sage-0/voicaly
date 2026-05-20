import { useEffect, useRef } from 'react';
import type { LogEvent } from '../types';

interface LogConsoleProps {
  logs: LogEvent[];
}

function formatTs(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function LogConsole({ logs }: LogConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [logs.length]);

  return (
    <div className="log-console">
      <div className="log-console-header">Log</div>
      <div className="log-console-body" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="log-line log-debug">
            <span className="log-ts">--:--:--</span>
            <span className="log-text">Waiting for pipeline logs...</span>
          </div>
        ) : (
          logs.map((l, i) => (
            <div key={i} className={`log-line log-${l.level}`}>
              <span className="log-ts">{formatTs(l.ts)}</span>
              <span className="log-text">{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
