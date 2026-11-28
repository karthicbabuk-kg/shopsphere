import { create } from 'zustand';

/** Number of API requests that have been waiting longer than the "slow" threshold. */
export const useSlowApi = create<{ slow: number }>(() => ({ slow: 0 }));

/** After this long without an answer we tell the visitor the free demo server is probably waking up. */
export const SLOW_AFTER_MS = 4000;

const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();
const flagged = new WeakSet<object>();

export function trackStart(config: object) {
  timers.set(
    config,
    setTimeout(() => {
      flagged.add(config);
      useSlowApi.setState((s) => ({ slow: s.slow + 1 }));
    }, SLOW_AFTER_MS),
  );
}

export function trackEnd(config: object | undefined) {
  if (!config) return;
  const t = timers.get(config);
  if (t) clearTimeout(t);
  timers.delete(config);
  if (flagged.delete(config)) useSlowApi.setState((s) => ({ slow: Math.max(0, s.slow - 1) }));
}

/**
 * Keeps the "server is waking up" banner on continuously across several retries, with no flicker in
 * the gaps between requests. Call the returned function when the whole operation is finished.
 */
export function holdSlow(): () => void {
  useSlowApi.setState((s) => ({ slow: s.slow + 1 }));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    useSlowApi.setState((s) => ({ slow: Math.max(0, s.slow - 1) }));
  };
}
