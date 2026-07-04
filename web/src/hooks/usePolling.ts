import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollingResult<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refetch: () => Promise<void>;
}

/** Re-fetches on an interval instead of opening a persistent connection (see docs/design-decisions.md). */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 4000, deps: unknown[] = []): PollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await refetch();
    };

    void run();
    const timer = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refetch };
}
