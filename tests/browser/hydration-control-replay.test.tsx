import { afterEach, expect, test, vi } from 'vite-plus/test';
import { userEvent } from 'vitest/browser';
import { hydrateSPA } from '@askrjs/askr/boot';
import { renderToStringSync } from '@askrjs/askr/ssr';
import type { JSXElement } from '@askrjs/askr/jsx-runtime';
import { routeRegistryFromTable } from '../router-test-utils';
import { createTestContainer } from '../../test-utils/render/test-renderer';

type PageComponent = () => JSXElement;
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
  vi.unstubAllGlobals();
});

function serverRoot(Page: PageComponent) {
  const { container: root, cleanup } = createTestContainer();
  cleanups.push(cleanup);
  window.history.replaceState({}, '', '/');
  root.innerHTML = renderToStringSync(Page);
  return root;
}

async function duringIdle(
  Page: PageComponent,
  beforeCommit: (root: HTMLDivElement) => void | Promise<void>
) {
  const root = serverRoot(Page);
  let release: (() => void) | undefined;
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    release = () => callback({ didTimeout: false, timeRemaining: () => 50 });
    return 1;
  });
  vi.stubGlobal('cancelIdleCallback', () => {});
  const hydration = hydrateSPA({
    root,
    registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
    hydrate: { deferUntilIdle: true, verifyMarkup: false },
  });
  try {
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await beforeCommit(root);
  } finally {
    release?.();
    await hydration;
  }
  return root;
}

function Control({
  kind,
  onEdit,
}: {
  kind: 'input' | 'textarea' | 'checkbox';
  onEdit: (event: Event) => void;
}) {
  return kind === 'textarea' ? (
    <textarea value="seed" onInput={onEdit} />
  ) : kind === 'checkbox' ? (
    <input type="checkbox" checked={false} onChange={onEdit} />
  ) : (
    <input value="seed" onInput={onEdit} />
  );
}

function edit(
  control: HTMLInputElement | HTMLTextAreaElement,
  kind: 'input' | 'textarea' | 'checkbox'
) {
  if (kind === 'checkbox') (control as HTMLInputElement).checked = true;
  else control.value = 'edited';
  control.dispatchEvent(
    new Event(kind === 'checkbox' ? 'change' : 'input', { bubbles: true })
  );
}

for (const kind of ['input', 'textarea', 'checkbox'] as const) {
  test(`should preserve the queued ${kind} edit through public root hydration`, async () => {
    const observed: Array<string | boolean> = [];
    const Page = () => (
      <Control
        kind={kind}
        onEdit={(event) =>
          observed.push(
            kind === 'checkbox'
              ? (event.target as HTMLInputElement).checked
              : (event.target as HTMLInputElement | HTMLTextAreaElement).value
          )
        }
      />
    );
    const root = serverRoot(Page);
    const control = root.querySelector('input,textarea') as
      | HTMLInputElement
      | HTMLTextAreaElement;
    const hydration = hydrateSPA({
      root,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
    });
    edit(control, kind);
    expect(observed).toEqual([]);
    await hydration;
    expect(root.querySelector('input,textarea')).toBe(control);
    expect(observed).toEqual([kind === 'checkbox' ? true : 'edited']);
  });

  test(`should preserve the ${kind} edit through public below-fold activation`, async () => {
    const observed: Array<string | boolean> = [];
    const Page = () => (
      <main>
        <div style={{ height: '2000px' }} />
        <section>
          <Control
            kind={kind}
            onEdit={(event) =>
              observed.push(
                kind === 'checkbox'
                  ? (event.target as HTMLInputElement).checked
                  : (event.target as HTMLInputElement | HTMLTextAreaElement)
                      .value
              )
            }
          />
        </section>
      </main>
    );
    const root = serverRoot(Page);
    const boundary = root.querySelector('section')!;
    const control = root.querySelector('input,textarea') as
      | HTMLInputElement
      | HTMLTextAreaElement;
    expect(boundary.getBoundingClientRect().top).toBeGreaterThan(100);
    await hydrateSPA({
      root,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
      hydrate: { deferBelowFold: true, foldThreshold: 100 },
    });
    expect(boundary.hasAttribute('data-skip-hydrate')).toBe(true);
    edit(control, kind);
    expect(boundary.hasAttribute('data-skip-hydrate')).toBe(false);
    expect(root.querySelector('input,textarea')).toBe(control);
    expect(observed).toEqual([kind === 'checkbox' ? true : 'edited']);
  });
}

test.each([
  {
    key: 'typing',
    keys: 'xy',
    initial: '',
    caret: 0,
    value: 'xy',
    edits: ['x', 'xy'],
  },
  {
    key: 'Backspace',
    keys: '{Backspace}',
    initial: 'xy',
    caret: 2,
    value: 'x',
    edits: ['x'],
  },
  {
    key: 'Delete',
    keys: '{Delete}',
    initial: 'xy',
    caret: 0,
    value: 'y',
    edits: ['y'],
  },
])(
  'should retain real $key edits before idle hydration and submit the latest queued value',
  async ({ keys, initial, caret, value, edits }) => {
    const observed: string[] = [];
    const Page = () => (
      <form
        onSubmit={(event: Event) => {
          event.preventDefault();
          observed.push(
            `submit:${new FormData(event.target as HTMLFormElement).get('name')}`
          );
        }}
      >
        <input
          name="name"
          value={initial}
          onInput={(event: Event) =>
            observed.push(`input:${(event.target as HTMLInputElement).value}`)
          }
        />
        <button>Save</button>
      </form>
    );
    let beforeCommit = '';
    const root = await duringIdle(Page, async (root) => {
      const input = root.querySelector('input')!;
      input.focus();
      input.setSelectionRange(caret, caret);
      await userEvent.keyboard(keys);
      beforeCommit = input.value;
      const submission = new SubmitEvent('submit', {
        bubbles: true,
        cancelable: true,
        submitter: root.querySelector('button'),
      });
      root.querySelector('form')!.dispatchEvent(submission);
      expect(submission.defaultPrevented).toBe(true);
      expect(observed).toEqual([]);
    });
    expect({
      beforeCommit,
      observed,
      finalValue: root.querySelector('input')!.value,
    }).toEqual({
      beforeCommit: value,
      observed: [...edits.map((edit) => `input:${edit}`), `submit:${value}`],
      finalValue: value,
    });
  }
);

test.each(['checkbox', 'canceled checkbox', 'radio'] as const)(
  'should preserve native click activation and cancellation for a queued %s',
  async (kind) => {
    const observed: string[] = [];
    const Page = () => (
      <input
        type={kind === 'radio' ? 'radio' : 'checkbox'}
        checked={false}
        onClick={(event: Event) => {
          observed.push(`click:${(event.target as HTMLInputElement).checked}`);
          if (kind === 'canceled checkbox') event.preventDefault();
        }}
        onInput={(event: Event) =>
          observed.push(`input:${(event.target as HTMLInputElement).checked}`)
        }
        onChange={(event: Event) =>
          observed.push(`change:${(event.target as HTMLInputElement).checked}`)
        }
      />
    );
    const root = await duringIdle(Page, (root) => {
      const input = root.querySelector('input')!;
      input.click();
      expect(input.checked).toBe(false);
      expect(observed).toEqual([]);
    });
    expect(observed).toEqual(
      kind === 'canceled checkbox'
        ? ['click:true']
        : ['click:true', 'input:true', 'change:true']
    );
    expect(root.querySelector('input')!.checked).toBe(
      kind !== 'canceled checkbox'
    );
  }
);

test('should keep Enter, modified shortcuts and anchor defaults canceled until handlers replay', async () => {
  const observed: string[] = [];
  const Page = () => (
    <form>
      <input
        onKeyDown={(event: KeyboardEvent) => {
          event.preventDefault();
          observed.push(event.key);
        }}
      />
      <a
        href="#replay-navigation"
        onClick={(event: Event) => {
          event.preventDefault();
          observed.push('anchor');
        }}
      >
        Navigate
      </a>
    </form>
  );
  const before = window.location.href;
  await duringIdle(Page, (root) => {
    const input = root.querySelector('input')!;
    for (const init of [
      { key: 'Enter' },
      { key: 'a', ctrlKey: true },
      { key: 's', metaKey: true },
      { key: 'x', altKey: true },
    ]) {
      const event = new KeyboardEvent('keydown', {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    root.querySelector('a')!.click();
    expect(observed).toEqual([]);
    expect(window.location.href).toBe(before);
  });
  expect(observed).toEqual(['Enter', 'a', 's', 'x', 'anchor']);
  expect(window.location.href).toBe(before);
});

test('should let an immediately activated text key handler cancel the native edit', async () => {
  const observed: string[] = [];
  const Page = () => (
    <main>
      <div style={{ height: '2000px' }} />
      <section>
        <input
          value="seed"
          onKeyDown={(event: KeyboardEvent) => {
            event.preventDefault();
            observed.push(event.key);
          }}
        />
      </section>
    </main>
  );
  const root = serverRoot(Page);
  await hydrateSPA({
    root,
    registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
    hydrate: { deferBelowFold: true, foldThreshold: 100 },
  });
  const boundary = root.querySelector('section')!;
  expect(boundary.hasAttribute('data-skip-hydrate')).toBe(true);
  const input = root.querySelector('input')!;
  input.focus();
  await userEvent.keyboard('x');
  expect(boundary.hasAttribute('data-skip-hydrate')).toBe(false);
  expect(input.value).toBe('seed');
  expect(observed).toEqual(['x']);
});

test('should retain native keyboard toggle behavior after public hydration completes', async () => {
  const observed: boolean[] = [];
  const Page = () => (
    <input
      type="checkbox"
      checked={false}
      onChange={(event: Event) =>
        observed.push((event.target as HTMLInputElement).checked)
      }
    />
  );
  const root = serverRoot(Page);
  await hydrateSPA({
    root,
    registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
  });
  const input = root.querySelector('input')!;
  input.focus();
  await userEvent.keyboard(' ');
  expect(input.checked).toBe(true);
  expect(observed).toEqual([true]);
});

test('should replay a trusted pointer checkbox activation once after public root hydration', async () => {
  const observed: boolean[] = [];
  const Page = () => (
    <input
      type="checkbox"
      checked={false}
      onChange={(event: Event) =>
        observed.push((event.target as HTMLInputElement).checked)
      }
    />
  );
  const root = await duringIdle(Page, async (root) => {
    const input = root.querySelector('input')!;
    await userEvent.click(input);
    expect(input.checked).toBe(false);
    expect(observed).toEqual([]);
  });
  expect(root.querySelector('input')!.checked).toBe(true);
  expect(observed).toEqual([true]);
});
