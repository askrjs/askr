import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA, state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { clearRoutes, getManifest, group, route } from '../../../src/router/route';

describe('routed shell focus preservation', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const testContainer = createTestContainer();
    container = testContainer.container;
    cleanup = testContainer.cleanup;
    clearRoutes();
    window.history.replaceState({}, '', '/example');
  });

  afterEach(() => {
    cleanup();
  });

  it('should preserve shell, sections, and input identity during routed page state updates', async () => {
    const ThemeProviderLike = ({ children }: { children?: unknown }) => (
      <div class="app-shell">
        <header>
          <nav>{'nav'}</nav>
        </header>
        <main>{children}</main>
      </div>
    );

    const AppLayout = ({ children }: { children?: unknown }) => (
      <ThemeProviderLike>{children}</ThemeProviderLike>
    );

    const Counter = () => <div class="counter">{'0'}</div>;
    const IconLabel = ({ children }: { children?: unknown }) => <span>{children}</span>;
    const Toggle = () => <button type="button">{'Bold'}</button>;
    const Field = ({
      onInput,
    }: {
      onInput: (event: Event) => void;
    }) => <input id="routed-name" placeholder="Type your name..." onInput={onInput} />;

    const ExamplePage = () => {
      const name = state('');

      return (
        <>
          <h1>{'Component Showcase'}</h1>
          <Counter />

          <div class="showcase-section">
            <h3>
              <IconLabel>{'Tabs'}</IconLabel>
            </h3>
            <p>{'Tabs content'}</p>
          </div>

          <div class="showcase-section">
            <h3>
              <IconLabel>{'Accordion'}</IconLabel>
            </h3>
            <p>{'Accordion content'}</p>
          </div>

          <div class="showcase-section">
            <h3>
              <IconLabel>{'Toggle & Input'}</IconLabel>
            </h3>
            <div class="example-controls">
              <Toggle />
              <Field
                onInput={(event: Event) =>
                  name.set((event.target as HTMLInputElement).value)
                }
              />
            </div>
            <p id="routed-preview">
              {name() ? `Hello, ${name()}!` : 'Type something above...'}
            </p>
          </div>
        </>
      );
    };

    group({ layout: AppLayout }, () => {
      route('/example', ExamplePage);
    });

    await createSPA({ root: container, manifest: getManifest() });
    flushScheduler();

    const shell = container.querySelector('.app-shell') as HTMLElement | null;
    const header = container.querySelector('header') as HTMLElement | null;
    const main = container.querySelector('main') as HTMLElement | null;
    const sections = Array.from(container.querySelectorAll('.showcase-section'));
    const input = container.querySelector('#routed-name') as HTMLInputElement | null;

    expect(shell).not.toBeNull();
    expect(header).not.toBeNull();
    expect(main).not.toBeNull();
    expect(input).not.toBeNull();

    input!.focus();
    input!.value = 'route';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const shellAfter = container.querySelector('.app-shell') as HTMLElement | null;
    const headerAfter = container.querySelector('header') as HTMLElement | null;
    const mainAfter = container.querySelector('main') as HTMLElement | null;
    const sectionsAfter = Array.from(container.querySelectorAll('.showcase-section'));
    const inputAfter = container.querySelector('#routed-name') as HTMLInputElement | null;
    const previewAfter = container.querySelector('#routed-preview') as HTMLElement | null;

    expect(shellAfter).toBe(shell);
    expect(headerAfter).toBe(header);
    expect(mainAfter).toBe(main);
    expect(sectionsAfter).toHaveLength(sections.length);
    expect(sectionsAfter[0]).toBe(sections[0]);
    expect(sectionsAfter[1]).toBe(sections[1]);
    expect(sectionsAfter[2]).toBe(sections[2]);
    expect(inputAfter).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(inputAfter?.value).toBe('route');
    expect(previewAfter?.textContent).toBe('Hello, route!');
  });
});