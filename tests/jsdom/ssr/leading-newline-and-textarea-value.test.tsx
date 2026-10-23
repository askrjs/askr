import { afterEach, describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

/**
 * The HTML parser drops one newline right after `<pre>`, `<textarea>` and
 * `<listing>` start tags, and a textarea's initial value is its text content,
 * not a `value` attribute. SSR output must parse back to what the component
 * rendered so hydration adopts the server nodes unchanged.
 */
describe('SSR leading newlines and textarea values', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it('should preserve a leading newline in pre and listing text', () => {
    const Page = () => (
      <div>
        <pre>{'\nhello'}</pre>
        <pre>{'plain'}</pre>
        <textarea value={'\nfirst'} />
      </div>
    );
    const { container: root, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    root.innerHTML = renderToStringSync(Page);
    const [withNewline, plain] = root.querySelectorAll('pre');
    expect(withNewline.textContent).toBe('\nhello');
    expect(plain.textContent).toBe('plain');
    expect(root.querySelector('textarea')!.value).toBe('\nfirst');
  });

  it('should render a textarea value as its text content', () => {
    const Page = () => <textarea value="hello" />;
    const { container: root, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    root.innerHTML = renderToStringSync(Page);
    expect(root.querySelector('textarea')!.value).toBe('hello');
  });

  it('should hydrate pre text and textarea values without rewriting them', async () => {
    const Page = () => (
      <div>
        <pre>{'\nhello'}</pre>
        <textarea value="hello" />
      </div>
    );
    const { container: root, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    root.innerHTML = renderToStringSync(Page);
    const pre = root.querySelector('pre')!;
    const preText = pre.firstChild;
    const textarea = root.querySelector('textarea')!;
    await hydrateSPA({
      root,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
    });
    expect(root.querySelector('pre')).toBe(pre);
    expect(pre.firstChild).toBe(preText);
    expect(pre.textContent).toBe('\nhello');
    expect(root.querySelector('textarea')).toBe(textarea);
    expect(textarea.value).toBe('hello');
  });
});
