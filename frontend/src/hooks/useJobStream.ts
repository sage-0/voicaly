import { useEffect } from 'react';
import type { SSEEvent } from '../types';

/**
 * Subscribe to the SSE event stream for a single job. Each parsed event is
 * passed to `onEvent`. The stream is closed when the component unmounts or
 * the jobId changes.
 *
 * Logs lifecycle and parse errors to the browser console under [SSE]/[Job].
 */
export function useJobStream(jobId: string | null, onEvent: (e: SSEEvent) => void) {
  useEffect(() => {
    if (!jobId) return;
    const url = `/api/jobs/${jobId}/events`;
    console.info('[Job] subscribing SSE', url);
    const es = new EventSource(url);

    es.onopen = () => console.info('[SSE] connection open');
    es.onmessage = e => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(parsed);
      } catch (err) {
        console.error('[SSE] failed to parse event', err, e.data);
      }
    };
    es.onerror = err => {
      // EventSource fires onerror on normal close too; downgrade to info if
      // the stream completed.
      console.warn('[SSE] stream error/close', err);
      es.close();
    };
    return () => {
      console.info('[Job] unsubscribing SSE');
      es.close();
    };
  }, [jobId]);
}
