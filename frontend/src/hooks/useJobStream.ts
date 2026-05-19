import { useEffect } from 'react';
import type { SSEEvent } from '../types';

export function useJobStream(jobId: string | null, onEvent: (e: SSEEvent) => void) {
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);
}
