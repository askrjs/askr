import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { dispatch, render, type RenderResult } from '@askrjs/askr/testing';
import {
  createHydratedUserRuntime,
  createUserHydrationPayload,
  UserPanel,
} from '../../../examples/platform-recipes/data-hydration';
import { LocalBoundaryRecipe } from '../../../examples/platform-recipes/error-boundaries';

let mounted: RenderResult | undefined;

afterEach(() => {
  mounted?.cleanup();
  mounted = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('verified component recipes through the public harness', () => {
  it('should render prefetched query data without a duplicate client fetch', async () => {
    const serverHandler = vi.fn(({ input }: { input: { id: string } }) =>
      Promise.resolve({ id: input.id, name: 'Ada' })
    );
    const clientFetch = vi.fn(() =>
      Promise.reject(new Error('unexpected client fetch'))
    );
    vi.stubGlobal('fetch', clientFetch);

    const payload = await createUserHydrationPayload('123', serverHandler);
    const runtime = createHydratedUserRuntime(payload);
    mounted = render(() => <UserPanel id="123" runtime={runtime} />);

    expect(serverHandler).toHaveBeenCalledOnce();
    expect(clientFetch).not.toHaveBeenCalled();
    expect(mounted.root.querySelector('h1')?.textContent).toBe('Ada');
  });

  it('should recover a local boundary without replacing the page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mounted = render(LocalBoundaryRecipe);
    const article = mounted.root.querySelector('article');

    expect(article).not.toBeNull();
    expect(mounted.root.textContent).toContain('Activity could not be loaded.');

    dispatch(mounted.root.querySelector('button')!, 'click');
    mounted.flush();

    expect(mounted.root.querySelector('article')).toBe(article);
    expect(mounted.root.textContent).toContain('Widget recovered.');
  });
});
