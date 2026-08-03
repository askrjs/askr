import { state } from '@askrjs/askr';
import { hydrateSPA } from '@askrjs/askr/boot';
import type { RouteRecord, RouteRegistry } from '@askrjs/askr/router';

function StaticPage() {
  const count = state(0);
  return (
    <button type="button" onClick={() => count.set((value) => value + 1)}>
      Count: {count()}
    </button>
  );
}

const record: RouteRecord = {
  path: '/',
  component: StaticPage,
  segments: [],
  rank: 0,
  layoutChain: [],
  pageChain: [],
  options: {},
  isFallback: false,
  handler: StaticPage,
};
const registry = {
  manifest: { records: [record] },
  routes: [{ path: '/', handler: StaticPage }],
} as unknown as RouteRegistry;

void hydrateSPA({
  root: '#app',
  registry,
  hydrate: { verifyMarkup: true },
});
