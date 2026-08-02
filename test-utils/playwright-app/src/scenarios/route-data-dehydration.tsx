/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { hydrateSPA } from '@askrjs/askr/boot';
import {
  createRouteRegistry,
  navigate,
  route,
  routeData,
} from '@askrjs/askr/router';

const payload =
  '<section><p id="visible">hydrated</p>' +
  '<button type="button">Read omitted data</button>' +
  '<button type="button">Load complete data</button></section>' +
  '<script type="application/json" data-askr-render-data="true">' +
  '{"version":1,"resources":{},"route":{"visible":"hydrated"},' +
  '"framework":{"rh":{"r":"/initial","o":{"secret":1}}}}</script>';

function InitialPage() {
  const data = routeData<{ visible: string; secret?: string }>();
  const [readOmitted, setReadOmitted] = state(false);
  let diagnostic = '';
  if (readOmitted()) {
    try {
      void data.secret;
    } catch (error) {
      diagnostic = String(error);
    }
  }
  return (
    <section>
      <p id="visible">{data.visible}</p>
      <button type="button" onClick={() => setReadOmitted(true)}>
        Read omitted data
      </button>
      <button type="button" onClick={() => navigate('/complete')}>
        Load complete data
      </button>
      {diagnostic ? <p role="alert">{diagnostic}</p> : null}
    </section>
  );
}

function CompletePage() {
  const data = routeData<{ secret: string }>();
  return <p>{data.secret}</p>;
}

export async function mountRouteDataDehydrationScenario(
  root: HTMLElement
): Promise<void> {
  window.history.replaceState({}, '', '/initial');
  root.innerHTML = payload;
  const registry = createRouteRegistry(() => {
    route('/initial', InitialPage);
    route('/complete', CompletePage, {
      loader: () => ({ visible: 'client', secret: 'complete' }),
      dehydrate: (data) => ({ visible: data.visible }),
    });
  });

  await hydrateSPA({
    root,
    registry,
    hydrate: { verifyMarkup: false },
  });
}
