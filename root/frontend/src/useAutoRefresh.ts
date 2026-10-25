import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data, then keeps it fresh: polls while the tab is visible and refetches
 * when the tab regains focus. This is what makes a slot someone else just booked
 * flip to "Booked" without a manual reload. Keeps the last good data on errors.
 */
export function useAutoRefresh<T>(fetcher: () => Promise<T>, intervalMs = 15_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    try {
      setData(await fetcherRef.current());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const tick = () => !document.hidden && reload();
    const id = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [reload, intervalMs]);

  return { data, error, loading, reload };
}
