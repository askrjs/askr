import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function selectedValues(select: HTMLSelectElement): string[] {
  return Array.from(select.selectedOptions, (option) => option.value);
}

function attributeTexts(el: Element): string[] {
  return Array.from(el.attributes, (attribute) => attribute.value);
}

describe('reactive form control props', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  function mount(component: () => unknown): void {
    createIsland({ root: container, component: component as never });
    flushScheduler();
  }

  it('should bind a select value function after its options exist', () => {
    let choice!: State<string>;
    mount(() => {
      choice = state('b');
      return (
        <select value={() => choice()}>
          <option value="a">A</option>
          <option value="b">B</option>
          <option value="c">C</option>
        </select>
      );
    });

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('b');
    expect(select.getAttribute('value')).toBe('b');
    expect(attributeTexts(select).join(' ')).not.toContain('=>');

    choice.set('c');
    flushScheduler();
    expect(container.querySelector('select')).toBe(select);
    expect(select.value).toBe('c');
    expect(select.getAttribute('value')).toBe('c');
  });

  it('should bind a constant select value function', () => {
    mount(() => (
      <select value={() => 'b'}>
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
    ));

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('b');
    expect(select.getAttribute('value')).toBe('b');
  });

  it('should reapply a select value function when its options change', () => {
    let options!: State<readonly string[]>;
    mount(() => {
      options = state<readonly string[]>(['a']);
      return (
        <select value={() => 'b'}>
          {options().map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      );
    });

    const select = container.querySelector('select') as HTMLSelectElement;
    // No option matches yet, as with a static value.
    expect(select.value).toBe('');

    options.set(['a', 'b']);
    flushScheduler();
    expect(container.querySelector('select')).toBe(select);
    expect(select.value).toBe('b');
  });

  it('should bind a multiple select value function', () => {
    let chosen!: State<readonly string[]>;
    mount(() => {
      chosen = state<readonly string[]>(['a', 'c']);
      return (
        <select multiple={true} value={() => chosen()}>
          <option value="a">A</option>
          <option value="b">B</option>
          <option value="c">C</option>
        </select>
      );
    });

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(selectedValues(select)).toEqual(['a', 'c']);

    chosen.set(['b']);
    flushScheduler();
    expect(selectedValues(select)).toEqual(['b']);
  });

  it('should bind input and textarea value functions', () => {
    let name!: State<string>;
    mount(() => {
      name = state('Ada');
      return (
        <form>
          <input value={() => name()} />
          <textarea value={() => name()} />
        </form>
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(input.value).toBe('Ada');
    expect(input.getAttribute('value')).toBe('Ada');
    expect(textarea.value).toBe('Ada');

    input.value = 'typed';
    name.set('Grace');
    flushScheduler();
    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('Grace');
    expect(input.getAttribute('value')).toBe('Grace');
    expect(textarea.value).toBe('Grace');
  });

  it('should bind checked and selected functions as live properties', () => {
    let on!: State<boolean>;
    mount(() => {
      on = state(true);
      return (
        <form>
          <input type="checkbox" checked={() => on()} />
          <select>
            <option value="a">A</option>
            <option value="b" selected={() => on()}>
              B
            </option>
          </select>
        </form>
      );
    });

    const checkbox = container.querySelector('input') as HTMLInputElement;
    const select = container.querySelector('select') as HTMLSelectElement;
    const optionB = select.options[1];
    expect(checkbox.checked).toBe(true);
    expect(checkbox.hasAttribute('checked')).toBe(true);
    expect(optionB.selected).toBe(true);
    expect(select.value).toBe('b');

    on.set(false);
    flushScheduler();
    expect(checkbox.checked).toBe(false);
    expect(checkbox.hasAttribute('checked')).toBe(false);
    expect(optionB.selected).toBe(false);
    expect(optionB.hasAttribute('selected')).toBe(false);

    checkbox.checked = true;
    on.set(true);
    flushScheduler();
    on.set(false);
    flushScheduler();
    expect(checkbox.checked).toBe(false);
  });

  it('should render the readable a prop function returns and follow it', () => {
    let useA!: State<boolean>;
    let a!: State<string>;
    let b!: State<string>;
    mount(() => {
      useA = state(true);
      a = state('A');
      b = state('B');
      return (
        <p title={() => (useA() ? a : b)} data-cell={() => a}>
          {'x'}
        </p>
      );
    });

    const p = container.querySelector('p') as HTMLParagraphElement;
    expect(p.getAttribute('title')).toBe('A');
    expect(p.getAttribute('data-cell')).toBe('A');

    a.set('A2');
    flushScheduler();
    expect(p.getAttribute('title')).toBe('A2');
    expect(p.getAttribute('data-cell')).toBe('A2');

    useA.set(false);
    flushScheduler();
    expect(p.getAttribute('title')).toBe('B');

    b.set('B2');
    flushScheduler();
    expect(p.getAttribute('title')).toBe('B2');
  });

  it('should bind a form control value function returning a readable', () => {
    let choice!: State<string>;
    mount(() => {
      choice = state('b');
      return (
        <select value={() => choice}>
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      );
    });

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('b');

    choice.set('a');
    flushScheduler();
    expect(select.value).toBe('a');
  });
});
