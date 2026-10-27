import { afterEach, describe, expect, it } from 'vite-plus/test';
import { hydrateSPA, cleanupApp } from '../../../src/boot';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

type Info = { path: string; expected: string; actual: string };

describe('hydration mismatch diagnostics', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  const Page = () => (
    <main>
      <div>a</div>
      <div>
        <span>x</span>
      </div>
    </main>
  );
  const serverHtml = '<main><div>a</div><div><p>x</p></div></main>';

  function setup(html: string) {
    const { container, cleanup } = createTestContainer();
    cleanups.push(() => {
      cleanupApp(container);
      cleanup();
    });
    container.innerHTML = html;
    const registry = routeRegistryFromTable([
      { path: '/', handler: Page as never },
    ]);
    return { container, registry };
  }

  it('should name the DOM path and expected and actual tags in the error', async () => {
    const { container, registry } = setup(serverHtml);
    const error = await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    }).then(
      () => null,
      (e: Error) => e
    );
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain('Hydration mismatch');
    expect(error!.message).toContain('main > div:nth-child(2) > p');
    expect(error!.message).toContain('<span>');
    expect(error!.message).toContain('<p>');
  });

  it('should report the differing text of a text mismatch', async () => {
    const { container, registry } = setup(
      '<main><div>a</div><div><span>y</span></div></main>'
    );
    const error = await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    }).then(
      () => null,
      (e: Error) => e
    );
    expect(error!.message).toContain('main > div:nth-child(2) > span');
    expect(error!.message).toContain('"x"');
    expect(error!.message).toContain('"y"');
  });

  it('should call onMismatch with path, expected and actual before failing', async () => {
    const { container, registry } = setup(serverHtml);
    const seen: Info[] = [];
    await expect(
      hydrateSPA({
        root: container,
        registry,
        hydrate: {
          verifyMarkup: true,
          onMismatch(info: Info) {
            seen.push(info);
          },
        },
      })
    ).rejects.toThrow(/Hydration mismatch/);
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe('main > div:nth-child(2) > p');
    expect(seen[0].expected).toBe('<span>');
    expect(seen[0].actual).toBe('<p>');
  });

  it('should patch and proceed when onMismatch returns continue', async () => {
    const { container, registry } = setup(serverHtml);
    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true, onMismatch: () => 'continue' },
    });
    expect(container.innerHTML).toBe(
      '<main><div>a</div><div><span>x</span></div></main>'
    );
  });
});
