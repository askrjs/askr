import { describe, it, expect, afterEach } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * Removing `value` from an element that is not a text control removes the
 * attribute, matching a fresh mount without the prop. Only inputs and
 * textareas reset their live value to an empty string.
 */
describe('value removal on non-form-control elements', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should remove the value attribute from option, button, li and progress', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    let setValue!: State<number | undefined>;
    createIsland({
      root: mounted.container,
      component: () => {
        const value = state<number | undefined>(1);
        setValue = value;
        return (
          <div>
            <select>
              <option value={value()}>Label</option>
            </select>
            <button value={value()}>Go</button>
            <ol>
              <li value={value()}>Item</li>
            </ol>
            <progress value={value()} max="10" />
          </div>
        );
      },
    });
    flushScheduler();
    const option = mounted.container.querySelector('option')!;
    const button = mounted.container.querySelector('button')!;
    const item = mounted.container.querySelector('li')!;
    const progress = mounted.container.querySelector('progress')!;
    expect(option.getAttribute('value')).toBe('1');
    expect(button.getAttribute('value')).toBe('1');

    setValue.set(undefined);
    flushScheduler();

    expect(option.hasAttribute('value')).toBe(false);
    expect(option.value).toBe('Label');
    expect(button.hasAttribute('value')).toBe(false);
    expect(button.value).toBe('');
    expect(item.hasAttribute('value')).toBe(false);
    expect(progress.hasAttribute('value')).toBe(false);
  });

  it('should still reset a text input and textarea to an empty value', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    let setValue!: State<string | undefined>;
    createIsland({
      root: mounted.container,
      component: () => {
        const value = state<string | undefined>('typed');
        setValue = value;
        return (
          <div>
            <input value={value()} />
            <textarea value={value()} />
          </div>
        );
      },
    });
    flushScheduler();
    setValue.set(undefined);
    flushScheduler();
    expect(mounted.container.querySelector('input')!.value).toBe('');
    expect(mounted.container.querySelector('textarea')!.value).toBe('');
  });

  it('should keep the creation value as the default text of a client textarea', () => {
    let setText!: State<string>;
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    createIsland({
      root: mounted.container,
      component: () => {
        const text = state('');
        setText = text;
        return <textarea value={text()} />;
      },
    });
    flushScheduler();
    const textarea = mounted.container.querySelector('textarea')!;
    expect(textarea.defaultValue).toBe('');
    setText.set('typed');
    flushScheduler();
    expect(textarea.value).toBe('typed');
    // The default text is the initial value, which form.reset() restores.
    expect(textarea.defaultValue).toBe('');
    expect(textarea.textContent).toBe('');
  });
});
