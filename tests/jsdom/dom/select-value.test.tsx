import { describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { For } from '../../../src/control';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('select value ownership', () => {
  it('should apply a controlled value after materializing its options', () => {
    let selectLocale!: (value: string) => void;
    const App = () => {
      const [locale, setLocale] = state('es');
      selectLocale = setLocale;
      return (
        <select value={locale()}>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      );
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('es');

      selectLocale('en');
      flushScheduler();
      expect(select.value).toBe('en');
    } finally {
      cleanup();
    }
  });

  it('should control every selected option in a multiple select', () => {
    let selectLocales!: (value: readonly string[] | null) => void;
    const App = () => {
      const [locales, setLocales] = state<readonly string[] | null>(['es']);
      selectLocales = setLocales;
      return (
        <select multiple={true} value={locales()}>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
        </select>
      );
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const select = container.querySelector('select') as HTMLSelectElement;
      const selectedValues = () =>
        Array.from(select.selectedOptions, (option) => option.value);

      expect(selectedValues()).toEqual(['es']);

      selectLocales(['en', 'fr']);
      flushScheduler();
      expect(container.querySelector('select')).toBe(select);
      expect(selectedValues()).toEqual(['en', 'fr']);

      selectLocales([]);
      flushScheduler();
      expect(selectedValues()).toEqual([]);

      selectLocales(null);
      flushScheduler();
      expect(selectedValues()).toEqual([]);
    } finally {
      cleanup();
    }
  });

  describe('when options change without the select being patched', () => {
    function mount(render: () => unknown) {
      const { container, cleanup } = createTestContainer();
      createIsland({ root: container, component: () => render() as never });
      flushScheduler();
      return {
        select: () => container.querySelector('select') as HTMLSelectElement,
        cleanup,
      };
    }

    it('should keep a static value when a child component adds options', () => {
      let options!: State<string[]>;
      function Options() {
        options = state<string[]>([]);
        return options().map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ));
      }
      const { select, cleanup } = mount(() => (
        <select value="b">
          <Options />
        </select>
      ));
      try {
        options.set(['a', 'b', 'c']);
        flushScheduler();
        expect(select().value).toBe('b');
      } finally {
        cleanup();
      }
    });

    it('should keep a function value when For adds options', () => {
      let options!: State<string[]>;
      let chosen!: State<string>;
      function App() {
        options = state<string[]>(['a']);
        chosen = state('c');
        return (
          <select value={() => chosen()}>
            <For each={options} by={(value) => value}>
              {(value) => <option value={value}>{value}</option>}
            </For>
          </select>
        );
      }
      const { select, cleanup } = mount(() => <App />);
      try {
        options.set(['a', 'b', 'c']);
        flushScheduler();
        expect(select().value).toBe('c');
        chosen.set('b');
        flushScheduler();
        expect(select().value).toBe('b');
      } finally {
        cleanup();
      }
    });

    it('should keep every selected option in a multiple select when options are reordered inside an optgroup', () => {
      let options!: State<string[]>;
      function Options() {
        options = state<string[]>(['a', 'b', 'c']);
        return (
          <optgroup label="letters">
            {options().map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </optgroup>
        );
      }
      const { select, cleanup } = mount(() => (
        <select multiple={true} value={['a', 'c']}>
          <Options />
        </select>
      ));
      try {
        options.set(['d', 'c', 'b', 'a']);
        flushScheduler();
        expect(
          Array.from(select().selectedOptions, (option) => option.value)
        ).toEqual(['c', 'a']);
      } finally {
        cleanup();
      }
    });
  });
});
