import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import { renderToStringSync } from '@askrjs/askr/ssr';
import { expect, test } from 'vite-plus/test';
import { routeRegistryFromTable } from '../router-test-utils';

test('should preserve matching raw descendants without constructing probe elements', async () => {
  let constructions = 0;
  const name = `x-askr-raw-hydration-${Math.random().toString(36).slice(2)}`;
  customElements.define(
    name,
    class extends HTMLElement {
      constructor() {
        super();
        constructions += 1;
      }
    }
  );

  const container = document.createElement('div');
  document.body.appendChild(container);
  const html = `<${name}></${name}>`;
  const App = () => <section dangerouslySetInnerHTML={{ __html: html }} />;
  const routes = [{ path: '/', handler: App }];
  window.history.replaceState({}, '', '/');
  container.innerHTML = renderToStringSync(() => <App />);
  const host = container.firstElementChild!;
  const serverNode = host.firstChild;
  const beforeHydration = constructions;

  try {
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
      hydrate: { verifyMarkup: false },
    });

    expect(host.firstChild).toBe(serverNode);
    expect(constructions).toBe(beforeHydration);
  } finally {
    cleanupApp(container);
    container.remove();
  }
});

test('should preserve equivalent SVG descendants during hydration', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const App = () => <svg dangerouslySetInnerHTML={{ __html: '<path/>' }} />;
  const routes = [{ path: '/', handler: App }];
  window.history.replaceState({}, '', '/');
  container.innerHTML = renderToStringSync(() => <App />);
  const host = container.firstElementChild!;
  const serverNode = host.firstChild;

  try {
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
      hydrate: { verifyMarkup: false },
    });

    expect(host.firstChild).toBe(serverNode);
  } finally {
    cleanupApp(container);
    container.remove();
  }
});
