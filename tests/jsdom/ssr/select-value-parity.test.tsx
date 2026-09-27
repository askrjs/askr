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

  it.each([
    [
      'trailing whitespace',
      () => (
        <select value="Apple">
          <option>{'Pear'}</option>
          <option>
            {'  Apple'} {'\n'}
          </option>
        </select>
      ),
    ],
    [
      'a component child',
      () => {
        const Label = () => <b>Apple</b>;
        return (
          <select value="Apple">
            <option>Pear</option>
            <option>
              <Label />
            </option>
          </select>
        );
      },
    ],
    [
      'an escaped character',
      () => (
        <select value="Salt &amp; Pepper">
          <option>Pear</option>
          <option>{'Salt & Pepper'}</option>
        </select>
      ),
    ],
  ])(
    'should select a value-less option by its rendered text with %s',
    async (_name, App) => {
      const html = renderToStringSync(App);
      expect(
        options(html).map((option) => option.hasAttribute('selected'))
      ).toEqual([false, true]);

      const { container, cleanup } = createTestContainer();
      try {
        container.innerHTML = html;
        await hydrateSPA({
          root: container,
          registry: routeRegistryFromTable([{ path: '/', handler: App }]),
          hydrate: { verifyMarkup: true },
        });
        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select.selectedIndex).toBe(1);
      } finally {
        cleanup();
      }
    }
  );

  it('should keep dangerouslySetInnerHTML content on a value-less option and select it', () => {
    const html = renderToStringSync(() => (
      <select value="A">
        <option>Z</option>
        <option dangerouslySetInnerHTML={{ __html: 'A' }} />
      </select>
    ));
    const [, option] = options(html);
    expect(option.textContent).toBe('A');
    expect(option.hasAttribute('selected')).toBe(true);
  });

  it('should leave imperative option children to the client', () => {
    const html = renderToStringSync(() => (
      <select value="X">
        <option imperativeChildren={true}>X</option>
      </select>
    ));
    expect(options(html)[0].textContent).toBe('');
  });

  it.each([null, undefined, false])(
    'should use option text when the option value is %s',
    (value) => {
      const html = renderToStringSync(() => (
        <select value="B">
          <option>A</option>
          <option value={value as never}>B</option>
        </select>
      ));
      expect(
        options(html).map((option) => option.hasAttribute('selected'))
      ).toEqual([false, true]);
    }
  );

  it.each([
    ['a named entity', 'A&nbsp;B', 'A\u00a0B'],
    ['a decimal entity', '&#65;', 'A'],
    ['a hex entity', '&#x41;', 'A'],
    ['a quote entity', '&quot;A&quot;', '"A"'],
  ])(
    'should decode %s in raw option HTML like the browser',
    (_name, raw, value) => {
      const html = renderToStringSync(() => (
        <select value={value}>
          <option>other</option>
          <option>
            <span dangerouslySetInnerHTML={{ __html: raw }} />
          </option>
        </select>
      ));
      const [, option] = options(html);
      expect(option.value).toBe(value);
      expect(option.hasAttribute('selected')).toBe(true);
    }
  );

  it('should leave script text out of an option value', () => {
    const html = renderToStringSync(() => (
      <select value="B">
        <option>A</option>
        <option>
          B<script>{'ignored'}</script>
        </option>
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
      return (
        <div>
          <select value={value()}>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
          <span title={value()}>tail</span>
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
      const span = container.querySelector('span')!;
      const setAttribute = span.setAttribute.bind(span);
      span.setAttribute = (name, value) => {
        if (name === 'title' && value === 'b') {
          throw new Error('later prop failed');
        }
        setAttribute(name, value);
      };
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

  it('should restore selection when writing the selected option fails', async () => {
    const { container, cleanup } = createTestContainer();
    let setValue!: (value: string) => void;
    function App() {
      const [value, set] = state('a');
      setValue = set;
      return (
        <select value={value()}>
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      );
    }
    try {
      await createSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
      });
      const select = container.querySelector('select') as HTMLSelectElement;
      const before = select.outerHTML;
      const option = select.options[1];
      const setAttribute = option.setAttribute.bind(option);
      option.setAttribute = (name, value) => {
        if (name === 'selected') throw new Error('selected write failed');
        setAttribute(name, value);
      };

      expect(() => {
        setValue('b');
        flushScheduler();
      }).toThrow('selected write failed');
      expect(select.outerHTML).toBe(before);
      expect(select.value).toBe('a');
    } finally {
      cleanup();
    }
  });
});
