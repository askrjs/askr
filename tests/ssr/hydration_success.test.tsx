// tests/ssr/hydration_success.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrate, renderToString, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('hydration success (SSR)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should attach listeners to server HTML during hydration', async () => {
    let clicks = 0;
    const Component = () => ({
      type: 'button',
      props: { id: 'btn', onClick: () => (clicks += 1) },
      children: ['click'],
    });

    const html = await renderToString(Component);
    container.innerHTML = html;

    await hydrate({ root: container, component: Component });
    flushScheduler();

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();
    flushScheduler();

    expect(clicks).toBe(1);
  });

  it('should accept input when component is hydrated', async () => {
    let value: ReturnType<typeof state<string>> | null = null;
    const Component = () => {
      value = state('');
      return {
        type: 'input',
        props: {
          id: 'input',
          value: value(),
          onInput: (e: Event) =>
            value!.set((e.target as HTMLInputElement).value),
        },
      };
    };

    const html = await renderToString(() => ({
      type: 'input',
      props: { id: 'input', value: '' },
    }));
    container.innerHTML = html;

    await hydrate({ root: container, component: Component });
    flushScheduler();

    const input = container.querySelector('#input') as HTMLInputElement;
    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    expect((container.querySelector('#input') as HTMLInputElement).value).toBe(
      'abc'
    );
  });

  it('should preserve server state after hydration', async () => {
    const Component = () => ({ type: 'div', children: ['server'] });
    const html = await renderToString(Component);
    container.innerHTML = html;

    await hydrate({ root: container, component: Component });
    flushScheduler();

    expect(container.textContent).toBe('server');
  });

  it('should preserve server state after hydration (sync server)', async () => {
    const Component = () => ({ type: 'div', children: ['async hydrated'] });

    const html = await renderToString(Component);
    container.innerHTML = html;

    await hydrate({ root: container, component: Component });
    flushScheduler();

    expect(container.textContent).toBe('async hydrated');
  });

  it('should handle state updates during hydration', async () => {
    let hydrated = false;
    const Component = () => {
      const count = state(0);
      hydrated = true;
      return {
        type: 'button',
        props: {
          onClick: () => count.set(count() + 1),
        },
        children: [`count: ${count()}`],
      };
    };

    const html = await renderToString(() => ({
      type: 'button',
      children: ['count: 0'],
    }));
    container.innerHTML = html;

    await hydrate({ root: container, component: Component });
    flushScheduler();

    expect(hydrated).toBe(true);
    expect(container.textContent).toBe('count: 0');

    // Click should work
    (container.firstChild as HTMLElement).click();
    flushScheduler();
    expect(container.textContent).toBe('count: 1');
  });

  it('should attach listeners to server HTML during hydration (sync server)', async () => {
    let clicks = 0;
    const Component = () => ({
      type: 'button',
      props: { id: 'btn', onClick: () => (clicks += 1) },
      children: ['async click'],
    });

    const html = await renderToString(Component);
    container.innerHTML = html;

    await hydrate({ root: container, component: Component });
    flushScheduler();

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();
    flushScheduler();

    expect(clicks).toBe(1);
  });
});
