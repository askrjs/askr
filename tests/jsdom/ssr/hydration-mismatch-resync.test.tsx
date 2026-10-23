import { afterEach, describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

/**
 * One extra server node must not make every later sibling a fresh node.
 * When the node under the hydration cursor does not match, the cursor looks
 * ahead for the sibling that does, and only the unmatched server nodes are
 * dropped at commit.
 */
describe('hydration resynchronization after a mismatch', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it('should keep later siblings after an extra server node', async () => {
    const Page = () => (
      <div>
        <b>bold</b>
        <p>para</p>
        <span>tail</span>
      </div>
    );
    const { container: root, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    root.innerHTML =
      '<div><i>extra</i><b>bold</b><p>para</p><span>tail</span></div>';
    const bold = root.querySelector('b')!;
    const para = root.querySelector('p')!;
    const tail = root.querySelector('span')!;
    await hydrateSPA({
      root,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
      hydrate: { verifyMarkup: false },
    });
    expect(root.querySelector('i')).toBeNull();
    expect(root.querySelector('b')).toBe(bold);
    expect(root.querySelector('p')).toBe(para);
    expect(root.querySelector('span')).toBe(tail);
    expect(root.firstElementChild!.innerHTML).toBe(
      '<b>bold</b><p>para</p><span>tail</span>'
    );
  });

  it('should not claim a later sibling that belongs after client-only content', async () => {
    const Page = () => (
      <div>
        <em>client</em>
        <b>bold</b>
      </div>
    );
    const { container: root, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    root.innerHTML = '<div><b>bold</b></div>';
    const bold = root.querySelector('b')!;
    await hydrateSPA({
      root,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
      hydrate: { verifyMarkup: false },
    });
    expect(root.firstElementChild!.innerHTML).toBe(
      '<em>client</em><b>bold</b>'
    );
    expect(root.querySelector('b')).toBe(bold);
  });
});
