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
});
