import { createSPA } from '@askrjs/askr';
import { getManifest } from '@askrjs/askr/router';
import { initializeAppSession } from './lib/mock-data';

// Import routes so the route tree registers at module load time.
import './router';

initializeAppSession();

// createSPA is async: it drains lazy() chunks, applies the manifest,
// resolves the initial route, and wires history navigation — all in one call.
await createSPA({
  root: document.getElementById('app')!,
  manifest: getManifest(),
});
