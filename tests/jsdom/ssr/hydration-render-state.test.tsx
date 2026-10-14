import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { HydrationCursor } from '../../../src/core/dom/hydration';
import { isHydratingRender } from '../../../src/core/dom/nodes';
import { renderToStringSync } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('hydration render context recovery', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should restore hydration render state and retain server nodes after a resource cursor failure', async () => {
    const App = () => <button>ready</button>;
    const registry = routeRegistryFromTable([{ path: '/', handler: App }]);
    container.innerHTML = renderToStringSync(() => <App />);
    const serverButton = container.querySelector('button');
    const failure = new Error('resource cursor failed');
    vi.spyOn(
      HydrationCursor.prototype,
      'claimResourceSlots'
    ).mockImplementationOnce(() => {
      throw failure;
    });

    await expect(hydrateSPA({ root: container, registry })).rejects.toThrow(
      failure
    );
    expect(isHydratingRender()).toBe(false);
    expect(container.querySelector('button')).toBe(serverButton);

    await hydrateSPA({ root: container, registry });
    expect(isHydratingRender()).toBe(false);
    expect(container.querySelector('button')).toBe(serverButton);
    expect(serverButton?.textContent).toBe('ready');
  });
});
