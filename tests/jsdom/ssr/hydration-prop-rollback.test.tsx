import { describe, expect, it, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

describe('hydration prop rollback', () => {
  it('should restore earlier adopted attributes when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<button id="first" data-mode="old">first</button>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector('#first')!;
    const second = container.querySelector('#second')!;
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('hydration attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare([
      <button key="first" id="first" data-mode="new">
        first
      </button>,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('data-mode')).toBe('old');
    expect(second.getAttribute('data-mode')).toBe('old');
    expect(container.textContent).toBe('firstsecond');
    root.dispose();
  });

  it('should restore adopted property and attribute state when a setter fails', () => {
    const tag = 'x-hydrate-prop-rollback';
    const config = { mode: 'new' };
    const failure = new Error('hydration property write failed');
    if (!customElements.get(tag)) {
      class HydrationPropProbe extends HTMLElement {
        value: unknown;
        throwOn: unknown;
        get config(): unknown {
          return this.value;
        }
        set config(value: unknown) {
          this.value = value;
          if (value === this.throwOn) throw failure;
        }
      }
      customElements.define(tag, HydrationPropProbe);
    }

    const container = document.createElement('div');
    container.innerHTML = `<${tag} config="server"></${tag}>`;
    const host = container.firstElementChild as HTMLElement & {
      config: unknown;
      throwOn: unknown;
    };
    host.throwOn = config;
    const root = createRoot(container, { hydrate: true });

    expect(() =>
      root.prepare(<x-hydrate-prop-rollback config={config} />).commit()
    ).toThrow(failure);
    expect(host.config).toBeUndefined();
    expect(host.getAttribute('config')).toBe('server');

    root.dispose();
  });

  it('should roll back an adopted property binding when its initial setter fails', () => {
    const tag = 'x-hydrate-bound-prop-rollback';
    const config = { mode: 'bound' };
    const failure = new Error('hydration bound property write failed');
    if (!customElements.get(tag)) {
      class HydrationBoundPropProbe extends HTMLElement {
        value: unknown;
        get config(): unknown {
          return this.value;
        }
        set config(value: unknown) {
          this.value = value;
          if (value === config) throw failure;
        }
      }
      customElements.define(tag, HydrationBoundPropProbe);
    }

    const container = document.createElement('div');
    container.innerHTML = `<${tag} config="server"></${tag}>`;
    const host = container.firstElementChild as HTMLElement & {
      config: unknown;
    };
    const root = createRoot(container, { hydrate: true });

    expect(() =>
      root
        .prepare(<x-hydrate-bound-prop-rollback config={() => config} />)
        .commit()
    ).toThrow(failure);
    expect(host.config).toBeUndefined();
    expect(host.getAttribute('config')).toBe('server');
    root.dispose();
  });
});
