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
import { createRouteRegistry, route } from '../../../src/router/route';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

describe('route metadata with loader data', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
  });

  afterEach(() => {
    cleanup();
    for (const node of Array.from(
      document.head.querySelectorAll('title, [data-askr-head]')
    )) {
      node.remove();
    }
  });

  it('should give meta the loader result on the initial route and on navigation', async () => {
    window.history.replaceState({}, '', '/user/ada');
    const registry = createRouteRegistry(() => {
      route('/user/{name}', () => <p>user</p>, {
        loader: async ({ params }) => ({ display: params.name.toUpperCase() }),
        meta: ({ data }) => ({ title: `User ${data?.display}` }),
      });
      route('/other', () => <p>other</p>);
    });

    await createSPA({ root: container, registry });
    expect(document.title).toBe('User ADA');

    navigate('/other');
    await vi.waitFor(() =>
      expect(container.querySelector('p')?.textContent).toBe('other')
    );
    navigate('/user/grace');
    await vi.waitFor(() => expect(document.title).toBe('User GRACE'));
  });
});
