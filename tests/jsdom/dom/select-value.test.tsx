import { describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { For } from '../../../src/control';
import { ErrorBoundary } from '@askrjs/askr/components';
import { vi } from 'vite-plus/test';
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

    it('should abort child option changes when a bound select write is caught by an error boundary', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      let options!: State<string[]>;
      let chosen!: State<string>;
      let select!: HTMLSelectElement;
      let didFail = false;
      const errors: unknown[] = [];
      function App() {
        options = state(['a']);
        chosen = state('b');
        return (
          <ErrorBoundary
            fallback={<p id="select-fallback">{'fallback'}</p>}
            onError={(error) => errors.push(error)}
          >
            <select
              value={() => chosen()}
              ref={(element) => {
                if (element) select = element as HTMLSelectElement;
              }}
            >
              <For each={options} by={(value) => value}>
                {(value) => <option value={value}>{value}</option>}
              </For>
            </select>
          </ErrorBoundary>
        );
      }
      const { container, cleanup } = createTestContainer();
      const originalSetAttribute = HTMLOptionElement.prototype.setAttribute;
      try {
        createIsland({ root: container, component: App });
        flushScheduler();
        const optionA = select.options[0];
        const setAttribute = originalSetAttribute;
        HTMLOptionElement.prototype.setAttribute = function (name, value) {
          setAttribute.call(this, name, value);
          if (this.value === 'b' && name === 'selected' && !didFail) {
            didFail = true;
            throw new Error('bound select write failed');
          }
        };

        options.set(['a', 'b']);
        flushScheduler();

        expect(didFail).toBe(true);
        expect(errors).toHaveLength(1);
        expect(Array.from(select.options)).toEqual([optionA]);
        expect(select.options[0]).toBe(optionA);
        expect(optionA.selected).toBe(false);
      } finally {
        HTMLOptionElement.prototype.setAttribute = originalSetAttribute;
        vi.restoreAllMocks();
        cleanup();
      }
    });

    it('should restore selection when a bound option value resync fails', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      let optionValue!: State<string>;
      let select!: HTMLSelectElement;
      let optionB!: HTMLOptionElement;
      let didFail = false;
      const errors: unknown[] = [];
      function App() {
        optionValue = state('x');
        return (
          <ErrorBoundary
            fallback={<p id="option-fallback">{'fallback'}</p>}
            onError={(error) => errors.push(error)}
          >
            <select
              value="b"
              ref={(element) => {
                if (element) select = element as HTMLSelectElement;
              }}
            >
              <option value="a">A</option>
              <option
                value={() => optionValue()}
                ref={(element) => {
                  if (element) optionB = element as HTMLOptionElement;
                }}
              >
                B
              </option>
            </select>
          </ErrorBoundary>
        );
      }
      const { container, cleanup } = createTestContainer();
      const originalSetAttribute = HTMLOptionElement.prototype.setAttribute;
      try {
        createIsland({ root: container, component: App });
        flushScheduler();
        HTMLOptionElement.prototype.setAttribute = function (name, value) {
          originalSetAttribute.call(this, name, value);
          if (this.value === 'b' && name === 'selected' && !didFail) {
            didFail = true;
            throw new Error('bound option resync failed');
          }
        };

        optionValue.set('b');
        flushScheduler();

        expect(didFail).toBe(true);
        expect(errors).toHaveLength(1);
        expect(select.selectedIndex).toBe(-1);
        expect(optionB.selected).toBe(false);
        expect(optionB.hasAttribute('selected')).toBe(false);
        expect(optionB.value).toBe('b');
      } finally {
        HTMLOptionElement.prototype.setAttribute = originalSetAttribute;
        vi.restoreAllMocks();
        cleanup();
      }
    });

    it('should keep the value after a boundary rewinds part of the pass', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      let options!: State<string[]>;
      let fail = true;
      function Failing(): never | null {
        if (fail) throw new Error('group failed');
        return null;
      }
      function Options() {
        options = state<string[]>(['a']);
        return (
          <>
            <ErrorBoundary fallback={null}>
              <optgroup label="first">
                {options().length > 1 ? <option value="z">z</option> : null}
              </optgroup>
              {options().length > 1 ? <Failing /> : null}
            </ErrorBoundary>
            {options().map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </>
        );
      }
      const { select, cleanup } = mount(() => (
        <select value="c">
          <Options />
        </select>
      ));
      try {
        options.set(['a', 'b', 'c']);
        flushScheduler();
        fail = false;
        expect(select().value).toBe('c');
      } finally {
        vi.restoreAllMocks();
        cleanup();
      }
    });

    it.each([
      [
        'a function child',
        (label: () => string) => <option>{() => label()}</option>,
      ],
      [
        'a child component',
        (label: () => string) => {
          const Label = () => <>{label()}</>;
          return (
            <option>
              <Label />
            </option>
          );
        },
      ],
    ])(
      'should follow a value-less option whose text changes through %s',
      (_name, renderOption) => {
        let label!: State<string>;
        function App() {
          label = state('X');
          return (
            <select value="B">
              <option>A</option>
              {renderOption(() => label())}
            </select>
          );
        }
        const { select, cleanup } = mount(() => <App />);
        try {
          expect(select().selectedIndex).toBe(-1);
          label.set('B');
          flushScheduler();
          expect(select().value).toBe('B');
        } finally {
          cleanup();
        }
      }
    );

    it('should follow an option whose value is bound to a function', () => {
      let optionValue!: State<string>;
      function App() {
        optionValue = state('x');
        return (
          <select value="b">
            <option value="a">A</option>
            <option value={() => optionValue()}>B</option>
          </select>
        );
      }
      const { select, cleanup } = mount(() => <App />);
      try {
        expect(select().selectedIndex).toBe(-1);
        optionValue.set('b');
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
