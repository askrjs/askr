/** @jsxImportSource @askrjs/askr */

import { createSPA } from '@askrjs/askr/boot';
import {
  createRouteRegistry,
  currentRoute,
  Link,
  route,
  updateRouteQuery,
} from '@askrjs/askr/router';

function HomePage() {
  return (
    <main>
      <p data-testid="logical-path">{currentRoute().path}</p>
      <Link href="/reviews/browser">Open review</Link>
    </main>
  );
}

function ReviewPage() {
  const snapshot = currentRoute<{ slug: string }>();
  return (
    <main>
      <p data-testid="logical-path">{snapshot.path}</p>
      <p>{snapshot.params.slug}</p>
      <button
        type="button"
        onClick={() => updateRouteQuery({ view: 'compact' })}
      >
        Compact view
      </button>
      <Link href="/">Home</Link>
    </main>
  );
}

export async function mountBasePathScenario(root: HTMLElement): Promise<void> {
  window.history.replaceState({}, '', '/website/');
  const registry = createRouteRegistry(
    () => {
      route('/', HomePage);
      route('/reviews/{slug}', ReviewPage);
    },
    { basePath: '/website' }
  );
  await createSPA({ root, registry });
}
