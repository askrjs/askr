import { resetRouteState } from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  currentAuth,
  route,
} from '../../../src/router/route';
import { state, type State } from '../../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

const identity = (id: string) => ({
  authenticated: true,
  principal: { id, subject: id },
  session: null,
  tenant: null,
  scopes: [],
});

async function settle() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

/**
 * The client identity a custom `resolve` produces belongs to the navigation
 * that resolved it. It is published with that navigation's commit, so a page
 * still on screen while a navigation is pending, failed or superseded keeps
 * reading the identity it was rendered with.
 */
describe('client auth publication', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/home');
  });
  afterEach(() => cleanup());

  it('should publish a resolved identity only when its navigation commits', async () => {
    const identities = [identity('alice'), identity('bob')];
    let resolves = 0;
    const gate = { open: () => {} };
    let bump!: State<number>;
    const registry = createRouteRegistry(
      () => {
        route('/home', () => {
          const tick = state(0);
          bump = tick;
          return <main>{`home:${currentAuth().principal?.id}:${tick()}`}</main>;
        });
        route(
          '/slow',
          () => <main>{`slow:${currentAuth().principal?.id}`}</main>,
          {
            loader: () => new Promise<void>((done) => (gate.open = done)),
          }
        );
      },
      { auth: { resolve: () => identities[Math.min(resolves++, 1)] } }
    );
    await createSPA({ root: container, registry });
    await settle();
    expect(container.textContent).toBe('home:alice:0');

    navigate('/slow');
    await settle();
    expect(resolves).toBe(2);
    bump.set(1);
    flushScheduler();
    expect(container.textContent).toBe('home:alice:1');

    gate.open();
    await settle();
    expect(container.textContent).toBe('slow:bob');
  });
});
