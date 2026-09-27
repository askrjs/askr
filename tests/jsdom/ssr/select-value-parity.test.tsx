import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { createSPA, hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

function options(html: string): HTMLOptionElement[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  return Array.from(template.content.querySelectorAll('option'));
}

describe('SSR select value parity', () => {
  it('should mark the first matching option for a single static value', () => {
    const html = renderToStringSync(() => (
      <select value="b">
        <option value="a">A</option>
        <optgroup label="group">
          <option value="b">B</option>
          <option value="b">B again</option>
        </optgroup>
      </select>
    ));
    expect(
      options(html).map((option) => option.hasAttribute('selected'))
    ).toEqual([false, true, false]);
  });

  it('should mark every matching option for a multiple reactive value', () => {
    const selected = () => ['a', 'b'];
    const html = renderToStringSync(() => (
      <select multiple={true} value={selected}>
        <option value="a">A</option>
        <optgroup label="group">
          <option value="b">B</option>
          <option value="b">B again</option>
          <option value="c">C</option>
        </optgroup>
      </select>
    ));
    expect(
      options(html).map((option) => option.hasAttribute('selected'))
    ).toEqual([true, true, true, false]);
  });

  it('should leave options unmarked for an unmatched value', () => {
    const html = renderToStringSync(() => (
      <select value="missing">
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
    ));
    expect(
      options(html).every((option) => !option.hasAttribute('selected'))
    ).toBe(true);
  });

  it('should keep an unmatched controlled select unselected through hydration', async () => {
    const { container, cleanup } = createTestContainer();
    const App = () => (
      <select value="missing">
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
    );
    try {
      container.innerHTML = renderToStringSync(App);
      const select = container.querySelector('select') as HTMLSelectElement;
      const originalOptions = Array.from(select.options);
      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
        hydrate: { verifyMarkup: true },
      });
      expect(container.querySelector('select')).toBe(select);
      expect(Array.from(select.options)).toEqual(originalOptions);
      expect(select.selectedIndex).toBe(-1);
      expect(
        originalOptions.every((option) => !option.hasAttribute('selected'))
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should use option text when an option has no value attribute', () => {
    const html = renderToStringSync(() => (
      <select value="B">
        <option>A</option>
        <option>B</option>
      </select>
    ));
    expect(
      options(html).map((option) => option.hasAttribute('selected'))
    ).toEqual([false, true]);
  });

  it('should read reactive select and option attributes once for SSR', () => {
    let selectReads = 0;
    let optionReads = 0;
    const html = renderToStringSync(() => (
      <select
        value={() => {
          selectReads += 1;
          return 'b';
        }}
      >
        <option
          value={() => {
            optionReads += 1;
            return 'b';
          }}
        >
          B
        </option>
      </select>
    ));
    expect(selectReads).toBe(1);
    expect(optionReads).toBe(1);
    expect(options(html)[0].hasAttribute('selected')).toBe(true);
  });

  it('should adopt selected options and update them after hydration', async () => {
    const { container, cleanup } = createTestContainer();
    let setValue!: (value: string) => void;
    function App() {
      const [value, set] = state('b');
      setValue = set;
      return (
        <select value={value()}>
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      );
    }
    try {
      container.innerHTML = renderToStringSync(App);
      const select = container.querySelector('select') as HTMLSelectElement;
      const originalOptions = Array.from(select.options);
      expect(select.value).toBe('b');

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
        hydrate: { verifyMarkup: true },
      });
      expect(container.querySelector('select')).toBe(select);
      expect(Array.from(select.options)).toEqual(originalOptions);
      expect(originalOptions[1].hasAttribute('selected')).toBe(true);

      setValue('a');
      flushScheduler();
      expect(select.value).toBe('a');
      expect(originalOptions[0].hasAttribute('selected')).toBe(true);
      expect(originalOptions[1].hasAttribute('selected')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should keep multiple selection and option identity through hydration', async () => {
    const { container, cleanup } = createTestContainer();
    let setValues!: (value: readonly string[]) => void;
    function App() {
      const [values, set] = state<readonly string[]>(['a', 'b']);
      setValues = set;
      return (
        <select multiple={true} value={values()}>
          <option value="a">A</option>
          <optgroup label="group">
            <option value="b">B</option>
            <option value="b">B again</option>
            <option value="c">C</option>
          </optgroup>
        </select>
      );
    }
    try {
      container.innerHTML = renderToStringSync(App);
      const select = container.querySelector('select') as HTMLSelectElement;
      const originalOptions = Array.from(select.options);
      expect(
        Array.from(select.selectedOptions, (option) => option.value)
      ).toEqual(['a', 'b', 'b']);

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
        hydrate: { verifyMarkup: true },
      });
      expect(container.querySelector('select')).toBe(select);
      expect(Array.from(select.options)).toEqual(originalOptions);

      setValues(['c']);
      flushScheduler();
      expect(
        Array.from(select.selectedOptions, (option) => option.value)
      ).toEqual(['c']);
      expect(
        originalOptions.map((option) => option.hasAttribute('selected'))
      ).toEqual([false, false, false, true]);
    } finally {
      cleanup();
    }
  });

  it('should restore option attributes when a later DOM commit fails', async () => {
    const { container, cleanup } = createTestContainer();
    let setValue!: (value: string) => void;
    function App() {
      const [value, set] = state('a');
      setValue = set;
      const trailingProps: Record<string, unknown> = { children: 'tail' };
      if (value() === 'b') {
        Object.defineProperty(trailingProps, 'title', {
          enumerable: true,
          get() {
            throw new Error('later prop failed');
          },
        });
      }
      return (
        <div>
          <select value={value()}>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
          {{ type: 'span', props: trailingProps }}
        </div>
      );
    }
    try {
      await createSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
      });
      flushScheduler();
      const select = container.querySelector('select') as HTMLSelectElement;
      const before = select.outerHTML;
      expect(() => {
        setValue('b');
        flushScheduler();
      }).toThrow('later prop failed');
      expect(select.outerHTML).toBe(before);
      expect(select.value).toBe('a');
    } finally {
      cleanup();
    }
  });
});
