'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface SSEOptions {
  /** Polling interval in seconds (default: 3) */
  interval?: number;
  /** Filter conditions sent to server */
  filters?: Record<string, any>;
  /** Whether to enable the connection (default: true) */
  enabled?: boolean;
}

interface SSEResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  /** Force a re-fetch */
  refetch: () => void;
}

/**
 * Hook that connects to an SSE endpoint and receives real-time Neon updates.
 * 
 * Usage:
 * const { data: seasons, loading } = useSSE<Season>('seasons');
 * const { data: teamSeasons } = useSSE<TeamSeason>('team_seasons', { filters: { team_id: '123' } });
 */
export function useSSE<T = any>(
  collection: string,
  options: SSEOptions = {}
): SSEResult<T> {
  const { interval = 3, filters, enabled = true } = options;
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refetch = useCallback(() => {
    setRefetchKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Build URL
    const params = new URLSearchParams({ collection, interval: interval.toString() });
    if (filters && Object.keys(filters).length > 0) {
      params.set('filters', JSON.stringify(filters));
    }

    const url = `/api/realtime/stream?${params.toString()}`;
    
    // Close previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener('initial', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setData(payload.data || []);
        setLoading(false);
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    });

    es.addEventListener('update', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setData(payload.data || []);
        setLoading(false);
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    });

    es.addEventListener('error', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setError(payload.error || 'Connection error');
      } catch {
        setError('SSE connection lost');
      }
    });

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [collection, interval, JSON.stringify(filters), enabled, refetchKey]);

  return { data, loading, error, connected, refetch };
}

/**
 * Simple hook that just fetches data once (for cases where SSE is overkill)
 */
export function useNeonFetch<T = any>(
  url: string,
  options?: { enabled?: boolean }
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = useCallback(() => setRefetchKey(k => k + 1), []);

  useEffect(() => {
    if (options?.enabled === false) return;

    setLoading(true);
    fetch(url)
      .then(r => r.json())
      .then(json => {
        setData(json.data || json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [url, refetchKey, options?.enabled]);

  return { data, loading, error, refetch };
}
