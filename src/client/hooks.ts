"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiFailure } from "./api";

export type Loaded<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Loading for more than 10 s (spec 1.8: "Still loading…" + Retry). */
  slow: boolean;
  /** When the shown data was fetched. */
  updatedAt: Date | null;
  /** The last refresh failed but older data is still shown. */
  stale: boolean;
  reload: () => Promise<void>;
};

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

/**
 * GET an /api/admin path. Polls only while the tab is visible, refetches on focus, backs off to 2× the
 * interval after a failed poll (up to 5 min), and keeps the last data on failure (spec 1.8, 1.9).
 */
export function useApi<T>(path: string | null, opts: { poll?: number | ((data: T | null) => number | undefined) } = {}): Loaded<T> {
  const [state, setState] = useState<Omit<Loaded<T>, "reload">>({ data: null, error: null, loading: Boolean(path), slow: false, updatedAt: null, stale: false });
  const dataRef = useRef<T | null>(null);
  const failures = useRef(0);
  const seq = useRef(0);
  const pollRef = useRef(opts.poll);
  useEffect(() => {
    pollRef.current = opts.poll;
  });

  const load = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, slow: false }));
    const slowTimer = setTimeout(() => {
      if (seq.current === mine) setState((s) => ({ ...s, slow: true }));
    }, 10_000);
    try {
      const data = await api.get<T>(path);
      if (seq.current !== mine) return;
      failures.current = 0;
      dataRef.current = data;
      setState({ data, error: null, loading: false, slow: false, updatedAt: new Date(), stale: false });
    } catch (error) {
      if (seq.current !== mine) return;
      failures.current += 1;
      if (error instanceof ApiFailure && error.code === "unauthenticated") window.dispatchEvent(new CustomEvent("cv:access-ended"));
      setState((s) => ({ ...s, error, loading: false, slow: false, stale: dataRef.current !== null }));
    } finally {
      clearTimeout(slowTimer);
    }
  }, [path]);

  useEffect(() => {
    dataRef.current = null;
    setState({ data: null, error: null, loading: Boolean(path), slow: false, updatedAt: null, stale: false });
    void load();
  }, [path, load]);

  useEffect(() => {
    if (!path) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const p = pollRef.current;
      const base = typeof p === "function" ? p(dataRef.current) : p;
      if (!base) return;
      const wait = Math.min(base * 1000 * (failures.current ? 2 ** Math.min(failures.current, 4) : 1), 300_000);
      timer = setTimeout(async () => {
        if (visible() && navigator.onLine !== false) await load();
        schedule();
      }, wait);
    };
    schedule();
    const onFocus = () => {
      if (visible()) void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("cv:refresh", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("cv:refresh", onFocus);
    };
  }, [path, load]);

  return { ...state, reload: load };
}

/** Ask every mounted useApi to refetch (after a mutation). */
export function refreshAll() {
  window.dispatchEvent(new CustomEvent("cv:refresh"));
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine !== false, () => true);
}

/** Current time, ticking once a minute (no animation, spec 1.6). */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** URL query state (filters live in the URL so Back works and pages are shareable, spec 1.2). */
export function useQueryState(): [URLSearchParams, (patch: Record<string, string | null | undefined>) => void] {
  const search = useSearchParams();
  const params = new URLSearchParams(search?.toString() ?? "");
  const update = useCallback((patch: Record<string, string | null | undefined>) => {
    // Changing a filter resets paging (spec 1.2).
    const drop = new Set(Object.keys(patch));
    if (!("offset" in patch)) drop.add("offset");
    const next = new URLSearchParams([...new URLSearchParams(window.location.search)].filter(([k]) => !drop.has(k)));
    for (const [k, v] of Object.entries(patch)) {
      if (v !== null && v !== undefined && v !== "") next.set(k, v);
    }
    const qs = next.toString();
    window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);
  return [params, update];
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
