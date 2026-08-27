import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  captureSSRSnapshot,
} from '../../../test-utils/render/test-renderer';

describe('htmlFor intrinsic prop normalization', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should render label htmlFor as a for attribute in the DOM', () => {
    const Component = () => <label htmlFor="email">Email</label>;

    createIsland({ root: container, component: Component });
    flushScheduler();

    const label = container.querySelector('label') as HTMLLabelElement;
    expect(label.getAttribute('for')).toBe('email');
    expect(label.getAttribute('htmlfor')).toBeNull();
  });

  it('should render output htmlFor, form, and name as DOM attributes', () => {
    const Component = () => (
      <output htmlFor="price quantity" form="cart" name="total">
        60
      </output>
    );

    createIsland({ root: container, component: Component });
    flushScheduler();

    const output = container.querySelector('output') as HTMLOutputElement;
    expect(output.getAttribute('for')).toBe('price quantity');
    expect(output.getAttribute('form')).toBe('cart');
    expect(output.getAttribute('name')).toBe('total');
    expect(output.getAttribute('htmlfor')).toBeNull();
  });

  it('should render standard global editing and virtual-keyboard hints', () => {
    const Component = () => (
      <input
        contentEditable="plaintext-only"
        draggable="false"
        enterKeyHint="next"
        inputMode="numeric"
        spellCheck="false"
      />
    );

    createIsland({ root: container, component: Component });
    flushScheduler();

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(input.getAttribute('draggable')).toBe('false');
    expect(input.getAttribute('enterkeyhint')).toBe('next');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });

  it('should update and remove htmlFor through reactive props', () => {
    let target!: ReturnType<typeof state<string | null>>;

    const Component = () => {
      target = state<string | null>('email');
      return <label htmlFor={() => target()}>Email</label>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const label = container.querySelector('label') as HTMLLabelElement;
    expect(label.getAttribute('for')).toBe('email');
    expect(label.getAttribute('htmlfor')).toBeNull();

    target.set('name');
    flushScheduler();
    expect(label.getAttribute('for')).toBe('name');
    expect(label.getAttribute('htmlfor')).toBeNull();

    target.set(null);
    flushScheduler();
    expect(label.getAttribute('for')).toBeNull();
    expect(label.getAttribute('htmlfor')).toBeNull();
  });

  it('should serialize label htmlFor as a for attribute in SSR', async () => {
    const Component = () => <label htmlFor="email">Email</label>;

    const html = await captureSSRSnapshot(Component);

    expect(html).toContain('<label for="email">Email</label>');
    expect(html).not.toContain('htmlfor=');
  });

  it('should serialize output htmlFor as a for attribute in SSR', async () => {
    const Component = () => (
      <output htmlFor="price quantity" form="cart" name="total">
        60
      </output>
    );

    const html = await captureSSRSnapshot(Component);

    expect(html).toContain(
      '<output for="price quantity" form="cart" name="total">60</output>'
    );
    expect(html).not.toContain('htmlfor=');
  });
});
