import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
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
});
