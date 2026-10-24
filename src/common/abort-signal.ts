/**
 * A signal that aborts, with the same reason, when any of `signals` does.
 *
 * `AbortSignal.any` is not available in every browser and host Askr targets,
 * so this uses it when present and otherwise forwards aborts itself.
 */
export function anyAbortSignal(signals: readonly AbortSignal[]): AbortSignal {
  const native = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal })
    .any;
  if (typeof native === 'function')
    return native.call(AbortSignal, [...signals]);

  const controller = new AbortController();
  const settled = signals.find((signal) => signal.aborted);
  if (settled) {
    controller.abort(settled.reason);
    return controller.signal;
  }
  const listeners = new Map<AbortSignal, () => void>();
  const release = () => {
    for (const [signal, listener] of listeners) {
      signal.removeEventListener('abort', listener);
    }
    listeners.clear();
  };
  for (const signal of new Set(signals)) {
    const listener = () => {
      release();
      controller.abort(signal.reason);
    };
    listeners.set(signal, listener);
    signal.addEventListener('abort', listener, { once: true });
  }
  return controller.signal;
}
