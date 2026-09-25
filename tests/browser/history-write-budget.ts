import { beforeEach } from 'vite-plus/test';

// @askr-allow-real-timers -- WebKit's History API quota is based on elapsed time.

// Browser test files share a runner page. WebKit limits that page to 100
// pushState/replaceState calls in 10 seconds, including calls from other test
// frames. Keep a single write ledger on the runner page and leave room for the
// next test's navigations. This only schedules tests; it never changes an app's
// history call or catches its error.
const WINDOW_MS = 10_000;
const START_BUDGET = 60;
type HistoryPage = Window & { __ASKR_TEST_HISTORY_WRITES?: number[] };
const page = (window.top ?? window) as HistoryPage;

function recentWrites(): number[] {
  const writes = (page.__ASKR_TEST_HISTORY_WRITES ??= []);
  const cutoff = Date.now() - WINDOW_MS;
  while (writes.length > 0 && writes[0]! <= cutoff) writes.shift();
  return writes;
}

for (const name of ['pushState', 'replaceState'] as const) {
  const original = window.history[name];
  Object.defineProperty(window.history, name, {
    configurable: true,
    writable: true,
    value: function (this: History, ...args: Parameters<typeof original>) {
      try {
        return original.apply(this, args);
      } finally {
        recentWrites().push(Date.now());
      }
    },
  });
}

beforeEach(async () => {
  while (true) {
    const writes = recentWrites();
    if (writes.length < START_BUDGET) return;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.max(1, writes[0]! + WINDOW_MS - Date.now()))
    );
  }
});
