import { describe, expect, it } from 'vite-plus/test';
import { createIsland } from '../../../test-utils/render/create-island';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { renderToStringSync, SSRDataMissingError } from '../../../src/ssr';

function createNeverThenable(): PromiseLike<unknown> {
  return {
    // eslint-disable-next-line unicorn/no-thenable -- Intentional PromiseLike regression fixture.
    then() {
      return createNeverThenable();
    },
  };
}

describe('component promise-like invariants', () => {
  it('should reject thenable client components as async', () => {
    const { container, cleanup } = createTestContainer();

    expect(() =>
      createIsland({
        root: container,
        component: () => createNeverThenable(),
      })
    ).toThrow(/Async components are not supported/i);

    cleanup();
  });

  it('should reject thenable SSR components through the synchronous SSR error', () => {
    expect(() =>
      renderToStringSync(() => createNeverThenable() as never)
    ).toThrow(SSRDataMissingError);
  });
});
