/** @jsxImportSource @askrjs/askr */

import { hydrateSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';
import { renderToString } from '@askrjs/askr/ssr';

export class HydrationProbe extends HTMLElement {
  items: unknown = undefined;
  config: unknown = undefined;
}

export const hydrationProbeConfig = { id: 1 };

function MediaControls() {
  return (
    <div>
      <video muted />
      <input type="checkbox" indeterminate />
      <x-hydration-probe
        config={hydrationProbeConfig}
        prop:items={[1]}
        attr:data-mode="raw"
      />
    </div>
  );
}

/**
 * Server-render a page with property-backed props, then hydrate it. Returns
 * the server markup so the test can check what SSR serialized.
 */
export async function mountDomPropertiesHydrationScenario(
  root: HTMLElement
): Promise<string> {
  if (!customElements.get('x-hydration-probe')) {
    customElements.define('x-hydration-probe', HydrationProbe);
  }

  const registry = createRouteRegistry(() => {
    route('/dom-properties', MediaControls);
  });

  if (window.location.pathname !== '/dom-properties') {
    window.history.replaceState({}, '', '/dom-properties');
  }

  const html = renderToString({
    url: `${window.location.pathname}${window.location.search}`,
    registry,
  });
  root.innerHTML = html;

  const before = {
    video: root.querySelector('video'),
    input: root.querySelector('input'),
    probe: root.querySelector('x-hydration-probe'),
  };
  await hydrateSPA({ root, registry });
  root.dataset.hydratedInPlace = String(
    before.video === root.querySelector('video') &&
      before.input === root.querySelector('input') &&
      before.probe === root.querySelector('x-hydration-probe')
  );
  return html;
}
