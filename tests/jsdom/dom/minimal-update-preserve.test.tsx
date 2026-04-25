import { describe, it, expect } from 'vite-plus/test';
import { defineContext, readContext, state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';

describe('minimal update preserves siblings', () => {
  it('should not replace unchanged sibling nodes during update', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const flag = state(false);
      return (
        <div>
          <span id={'keep'}>{'keep'}</span>
          {flag() ? (
            <span id={'maybe'}>{'A'}</span>
          ) : (
            <span id={'maybe'}>{'B'}</span>
          )}
        </div>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: Component });

    const keepBefore = container.querySelector('#keep') as HTMLElement | null;
    expect(keepBefore).not.toBeNull();

    // Trigger update
    // Need to get state setter - wrap component to expose setter
    let setFlag: (v: boolean) => void = () => {};
    const Controlled = () => {
      const s = state(false);
      setFlag = (v: boolean) => s.set(v);
      return (
        <div>
          <span id={'keep'}>{'keep'}</span>
          {s() ? (
            <span id={'maybe'}>{'A'}</span>
          ) : (
            <span id={'maybe'}>{'B'}</span>
          )}
        </div>
      ) as unknown as JSXElement;
    };

    cleanup();
    const { container: c2, cleanup: cleanup2 } = createTestContainer();
    createIsland({ root: c2, component: Controlled });

    const keepNode = c2.querySelector('#keep') as HTMLElement | null;
    expect(keepNode).not.toBeNull();

    setFlag(true);
    flushScheduler();

    const keepAfter = c2.querySelector('#keep') as HTMLElement | null;
    expect(keepAfter).toBe(keepNode);

    cleanup2();
  });

  it('should preserve component child identity and focus during sibling text updates', () => {
    const { container, cleanup } = createTestContainer();

    const Field = ({
      onInput,
    }: {
      onInput: (event: Event) => void;
    }) => <input id={'name'} placeholder={'Type your name...'} onInput={onInput} />;

    const Toggle = () => <button type={'button'}>{'Bold'}</button>;

    const App = () => {
      const name = state('');

      return (
        <div>
          <div class={'example-controls'}>
            <Toggle />
            <Field
              onInput={(event: Event) =>
                name.set((event.target as HTMLInputElement).value)
              }
            />
          </div>
          <p id={'preview'}>{name() ? `Hello, ${name()}!` : 'Type something above...'}</p>
        </div>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const input = container.querySelector('#name') as HTMLInputElement | null;
    const preview = container.querySelector('#preview') as HTMLElement | null;

    expect(input).not.toBeNull();
    expect(preview?.textContent).toBe('Type something above...');

    input!.focus();
    input!.value = 'abc';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const inputAfter = container.querySelector('#name') as HTMLInputElement | null;
    expect(inputAfter).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(preview?.textContent).toBe('Hello, abc!');

    cleanup();
  });

  it('should preserve a later nested page section during sibling text updates', () => {
    const { container, cleanup } = createTestContainer();

    const Counter = () => <div class={'counter'}>{'0'}</div>;
    const IconLabel = ({ children }: { children?: unknown }) => <span>{children}</span>;
    const Toggle = () => <button type={'button'}>{'Bold'}</button>;
    const Field = ({
      onInput,
    }: {
      onInput: (event: Event) => void;
    }) => <input id={'fragment-name'} placeholder={'Type your name...'} onInput={onInput} />;

    const Page = () => {
      const name = state('');

      return (
        <>
          <h1>{'Component Showcase'}</h1>
          <p>{'Intro'}</p>
          <Counter />

          <div class={'showcase-section'}>
            <h3>
              <IconLabel>{'Tabs'}</IconLabel>
            </h3>
            <p>{'Tabs content'}</p>
          </div>

          <div class={'showcase-section'}>
            <h3>
              <IconLabel>{'Accordion'}</IconLabel>
            </h3>
            <p>{'Accordion content'}</p>
          </div>

          <div class={'showcase-section'}>
            <h3>
              <IconLabel>{'Toggle & Input'}</IconLabel>
            </h3>
            <p>{'Reactive state driving UI updates in real time.'}</p>
            <div class={'example-controls'}>
              <Toggle />
              <Field
                onInput={(event: Event) =>
                  name.set((event.target as HTMLInputElement).value)
                }
              />
            </div>
            <p>{name() ? `Hello, ${name()}!` : 'Type something above...'}</p>
          </div>
        </>
      ) as unknown as JSXElement;
    };

    const App = () => (
      <main>
        <Page />
      </main>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const sections = container.querySelectorAll('.showcase-section');
    const lastSection = sections[sections.length - 1] as HTMLDivElement | undefined;
    const input = container.querySelector('#fragment-name') as HTMLInputElement | null;

    expect(lastSection).toBeDefined();
    expect(input).not.toBeNull();

    input!.focus();
    input!.value = 'later';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const sectionsAfter = container.querySelectorAll('.showcase-section');
    const lastSectionAfter = sectionsAfter[
      sectionsAfter.length - 1
    ] as HTMLDivElement | undefined;
    const inputAfter = container.querySelector('#fragment-name') as HTMLInputElement | null;

    expect(lastSectionAfter).toBe(lastSection);
    expect(inputAfter).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(inputAfter?.value).toBe('later');

    cleanup();
  });

  it('should preserve a shared shell host and owner chain during nested page updates', () => {
    const { container, cleanup } = createTestContainer();

    const ThemeProviderLike = ({ children }: { children?: unknown }) => (
      <div class={'app-shell'}>
        <header>{'Shell'}</header>
        <main>{children}</main>
      </div>
    );

    const AppLayout = ({ children }: { children?: unknown }) => (
      <ThemeProviderLike>{children}</ThemeProviderLike>
    );

    const Counter = () => <div class={'counter'}>{'0'}</div>;
    const IconLabel = ({ children }: { children?: unknown }) => <span>{children}</span>;
    const Toggle = () => <button type={'button'}>{'Bold'}</button>;
    const Field = ({
      onInput,
    }: {
      onInput: (event: Event) => void;
    }) => <input id={'shared-host-name'} onInput={onInput} />;

    const Page = () => {
      const name = state('');

      return (
        <>
          <h1>{'Component Showcase'}</h1>
          <Counter />

          <div class={'showcase-section'}>
            <h3>
              <IconLabel>{'Tabs'}</IconLabel>
            </h3>
            <p>{'Tabs content'}</p>
          </div>

          <div class={'showcase-section'}>
            <h3>
              <IconLabel>{'Accordion'}</IconLabel>
            </h3>
            <p>{'Accordion content'}</p>
          </div>

          <div class={'showcase-section'}>
            <h3>
              <IconLabel>{'Toggle & Input'}</IconLabel>
            </h3>
            <div class={'example-controls'}>
              <Toggle />
              <Field
                onInput={(event: Event) =>
                  name.set((event.target as HTMLInputElement).value)
                }
              />
            </div>
            <p id={'shared-host-preview'}>
              {name() ? `Hello, ${name()}!` : 'Type something above...'}
            </p>
          </div>
        </>
      ) as unknown as JSXElement;
    };

    const Root = () => (
      <AppLayout>
        <Page />
      </AppLayout>
    );

    createIsland({ root: container, component: Root });
    flushScheduler();

    const shell = container.querySelector('.app-shell') as
      | (HTMLElement & {
          __ASKR_INSTANCES?: Array<{ fn?: { name?: string } }>;
        })
      | null;
    const main = container.querySelector('main') as HTMLElement | null;
    const sections = Array.from(container.querySelectorAll('.showcase-section'));
    const input = container.querySelector(
      '#shared-host-name'
    ) as HTMLInputElement | null;

    expect(shell).not.toBeNull();
    expect(main).not.toBeNull();
    expect(input).not.toBeNull();
    expect(
      shell?.__ASKR_INSTANCES?.map((instance) => instance.fn?.name)
    ).toEqual(expect.arrayContaining(['ThemeProviderLike', 'AppLayout']));

    input!.focus();
    input!.value = 'shell';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const shellAfter = container.querySelector('.app-shell') as HTMLElement | null;
    const mainAfter = container.querySelector('main') as HTMLElement | null;
    const sectionsAfter = Array.from(container.querySelectorAll('.showcase-section'));
    const inputAfter = container.querySelector(
      '#shared-host-name'
    ) as HTMLInputElement | null;
    const previewAfter = container.querySelector(
      '#shared-host-preview'
    ) as HTMLElement | null;

    expect(shellAfter).toBe(shell);
    expect(mainAfter).toBe(main);
    expect(sectionsAfter).toHaveLength(sections.length);
    expect(sectionsAfter[0]).toBe(sections[0]);
    expect(sectionsAfter[1]).toBe(sections[1]);
    expect(sectionsAfter[2]).toBe(sections[2]);
    expect(inputAfter).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(inputAfter?.value).toBe('shell');
    expect(previewAfter?.textContent).toBe('Hello, shell!');

    cleanup();
  });

  it('should preserve nested scope context during sibling input updates', () => {
    const { container, cleanup } = createTestContainer();

    const OuterContext = defineContext<string | null>(null);
    const InnerContext = defineContext<string | null>(null);

    const ContextConsumer = () => {
      const outer = readContext(OuterContext);
      const inner = readContext(InnerContext);

      return <p id={'context-preview'}>{`${outer}:${inner}`}</p>;
    };

    const NestedScopes = ({ children }: { children?: unknown }) => (
      <OuterContext.Scope value={'outer'}>
        <InnerContext.Scope value={'inner'}>
          <section class={'scoped-shell'}>{children}</section>
        </InnerContext.Scope>
      </OuterContext.Scope>
    );

    const App = () => {
      const name = state('');

      return (
        <NestedScopes>
          <div class={'example-controls'}>
            <input
              id={'scoped-name'}
              onInput={(event: Event) =>
                name.set((event.target as HTMLInputElement).value)
              }
            />
          </div>
          <ContextConsumer />
          <p id={'typed-preview'}>{name() || 'empty'}</p>
        </NestedScopes>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const input = container.querySelector('#scoped-name') as HTMLInputElement | null;
    const shell = container.querySelector('.scoped-shell') as HTMLElement | null;

    expect(input).not.toBeNull();
    expect(shell).not.toBeNull();
    expect(container.querySelector('#context-preview')?.textContent).toBe(
      'outer:inner'
    );

    input!.focus();
    input!.value = 'typed';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const shellAfter = container.querySelector('.scoped-shell') as HTMLElement | null;
    const inputAfter = container.querySelector(
      '#scoped-name'
    ) as HTMLInputElement | null;

    expect(shellAfter).toBe(shell);
    expect(inputAfter).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('#context-preview')?.textContent).toBe(
      'outer:inner'
    );
    expect(container.querySelector('#typed-preview')?.textContent).toBe('typed');

    cleanup();
  });
});
