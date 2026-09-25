import { afterEach, beforeEach, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { currentRoute } from '../../../src/router/activity';
import { navigate } from '../../../src/router/navigate';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

let view: ReturnType<typeof createTestContainer>;
beforeEach(() => {
  view = createTestContainer();
  window.history.replaceState({}, '', '/page?step=0');
});
afterEach(() => {
  cleanupApp(view.container);
  view.cleanup();
  window.history.replaceState({}, '', '/');
});

it('should restore the applied-props baseline when a navigation rolls back', async () => {
  function Child({ step }: { step: number }) {
    if (step === 1) throw new Error('child failed');
    return <span>{step}</span>;
  }
  const classes = ['a', 'b', 'c'];
  await createSPA({
    root: view.container,
    registry: routeRegistryFromTable([
      {
        path: '/page',
        handler: () => {
          const step = Number(currentRoute().query.get('step'));
          return (
            <button
              disabled={step === 0}
              class={classes[step]}
              title={step === 0 ? 'x' : undefined}
            >
              <Child step={step} />
            </button>
          );
        },
      },
    ]),
  });
  const button = view.container.querySelector('button')!;
  expect(() => {
    navigate('/page?step=1');
    flushScheduler();
  }).toThrow('child failed');
  expect(view.container.querySelector('button')).toBe(button);
  expect(button.getAttribute('class')).toBe('a');
  navigate('/page?step=2');
  flushScheduler();
  expect(view.container.querySelector('button')).toBe(button);
  expect({
    class: button.getAttribute('class'),
    disabled: button.hasAttribute('disabled'),
    title: button.hasAttribute('title'),
  }).toEqual({ class: 'c', disabled: false, title: false });
});
