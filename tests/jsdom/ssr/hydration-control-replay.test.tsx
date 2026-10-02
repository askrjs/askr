import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { beginHydrationInteractionReplay } from '../../../src/boot/hydration-interaction-replay';
import { hydrateSPA } from '../../../src/boot';
import { state } from '../../../src';
import { renderToStringSync } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
  vi.restoreAllMocks();
});

function fixture(markup: string, activate?: (boundary: Element) => boolean) {
  const { container: root, cleanup } = createTestContainer();
  root.innerHTML = markup;
  const replay = beginHydrationInteractionReplay(
    root,
    activate ?? (() => true)
  );
  cleanups.push(() => {
    replay.abort();
    cleanup();
  });
  return { root, replay };
}

describe('hydration control state replay', () => {
  it('should release root capture listeners when the final boundary replaces the event target', () => {
    const { root, replay } = fixture(
      '<section data-skip-hydrate><input></section>',
      (boundary) => {
        boundary.replaceChildren(document.createElement('input'));
        boundary.removeAttribute('data-skip-hydrate');
        return true;
      }
    );
    const removals = vi.spyOn(root, 'removeEventListener');
    replay.registerDeferredBoundaries([root.firstElementChild!]);
    replay.complete();
    expect(removals).not.toHaveBeenCalled();
    root
      .querySelector('input')!
      .dispatchEvent(new Event('input', { bubbles: true }));
    expect(removals.mock.calls.map(([type]) => type)).toEqual([
      'click',
      'dblclick',
      'pointerdown',
      'pointerup',
      'keydown',
      'keyup',
      'input',
      'change',
      'submit',
    ]);
  });

  it('should adopt ordered queued edits into application state before public hydration replays submit', async () => {
    const { container: root, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    const observed: string[] = [];
    const Page = () => {
      const name = state('seed');
      return (
        <form
          onSubmit={(event: Event) => {
            event.preventDefault();
            observed.push(`submit:${name()}`);
          }}
        >
          <input
            value={name}
            onInput={(event: Event) => {
              name.set((event.target as HTMLInputElement).value);
              observed.push(`input:${name()}`);
            }}
          />
        </form>
      );
    };
    root.innerHTML = renderToStringSync(Page);
    const input = root.querySelector('input')!;
    const hydration = hydrateSPA({
      root,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
    });
    for (const value of ['x', 'xy']) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    root
      .querySelector('form')!
      .dispatchEvent(
        new SubmitEvent('submit', { bubbles: true, cancelable: true })
      );
    await hydration;
    expect(observed).toEqual(['input:x', 'input:xy', 'submit:xy']);
    expect(input.value).toBe('xy');
  });

  it.each(['input', 'textarea', 'checkbox'] as const)(
    'should retain the captured %s state after root hydration writes',
    (kind) => {
      const { root, replay } = fixture(
        kind === 'textarea'
          ? '<textarea>seed</textarea>'
          : `<input type="${kind === 'checkbox' ? 'checkbox' : 'text'}" value="seed">`
      );
      const control = root.firstElementChild as
        | HTMLInputElement
        | HTMLTextAreaElement;
      const observed: Array<string | boolean> = [];
      const checked = kind === 'checkbox';
      if (checked) (control as HTMLInputElement).checked = true;
      else control.value = 'edited';
      control.dispatchEvent(
        new Event(checked ? 'change' : 'input', { bubbles: true })
      );
      if (checked) (control as HTMLInputElement).checked = false;
      else control.value = 'seed';
      control.addEventListener(checked ? 'change' : 'input', () =>
        observed.push(
          checked ? (control as HTMLInputElement).checked : control.value
        )
      );

      replay.complete();

      expect(observed).toEqual([checked ? true : 'edited']);
      expect(
        checked ? (control as HTMLInputElement).checked : control.value
      ).toBe(checked ? true : 'edited');
    }
  );

  it.each(['input', 'textarea', 'checkbox'] as const)(
    'should restore captured %s state after deferred boundary activation',
    (kind) => {
      const observed: Array<string | boolean> = [];
      const checked = kind === 'checkbox';
      const { root, replay } = fixture(
        `<section data-skip-hydrate>${kind === 'textarea' ? '<textarea>seed</textarea>' : `<input type="${checked ? 'checkbox' : 'text'}" value="seed">`}</section>`,
        (boundary) => {
          const control = boundary.firstElementChild as
            | HTMLInputElement
            | HTMLTextAreaElement;
          if (checked) (control as HTMLInputElement).checked = false;
          else control.value = 'seed';
          control.addEventListener(checked ? 'change' : 'input', () =>
            observed.push(
              checked ? (control as HTMLInputElement).checked : control.value
            )
          );
          boundary.removeAttribute('data-skip-hydrate');
          return true;
        }
      );
      replay.registerDeferredBoundaries([root.firstElementChild!]);
      replay.complete();
      const control = root.querySelector('input,textarea') as
        | HTMLInputElement
        | HTMLTextAreaElement;
      if (checked) (control as HTMLInputElement).checked = true;
      else control.value = 'edited';
      control.dispatchEvent(
        new Event(checked ? 'change' : 'input', { bubbles: true })
      );

      expect(observed).toEqual([checked ? true : 'edited']);
    }
  );

  it('should replay each edit in order before the queued submit observes the latest edit', () => {
    const { root, replay } = fixture(
      '<form><input name="name" value="seed"><button>Save</button></form>'
    );
    const form = root.querySelector('form')!;
    const input = root.querySelector('input')!;
    const observed: string[] = [];
    for (const value of ['x', 'xy']) {
      input.value = value;
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: value.at(-1),
          inputType: 'insertText',
        })
      );
    }
    form.dispatchEvent(
      new SubmitEvent('submit', {
        bubbles: true,
        cancelable: true,
        submitter: root.querySelector('button'),
      })
    );
    input.value = 'seed';
    input.addEventListener('input', () =>
      observed.push(`input:${input.value}`)
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      observed.push(`submit:${new FormData(form).get('name')}`);
    });

    replay.complete();

    expect(observed).toEqual(['input:x', 'input:xy', 'submit:xy']);
  });

  it.each(['abort', 'detach'] as const)(
    'should discard captured edits when the target is unavailable (%s)',
    (action) => {
      const { root, replay } = fixture('<input value="seed">');
      const input = root.querySelector('input')!;
      const observed: string[] = [];
      input.value = 'edited';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = 'seed';
      input.addEventListener('input', () => observed.push(input.value));
      if (action === 'abort') replay.abort();
      else input.remove();

      replay.complete();

      expect(observed).toEqual([]);
      expect(input.value).toBe('seed');
    }
  );

  it('should discard an edit when activation replaces its original target', () => {
    const observed: string[] = [];
    const { root, replay } = fixture(
      '<section data-skip-hydrate><input value="seed"></section>',
      (boundary) => {
        boundary.replaceChildren(document.createElement('input'));
        boundary.removeAttribute('data-skip-hydrate');
        return true;
      }
    );
    replay.registerDeferredBoundaries([root.firstElementChild!]);
    replay.complete();
    const input = root.querySelector('input')!;
    input.addEventListener('input', () => observed.push(input.value));
    input.value = 'edited';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(observed).toEqual([]);
    expect(root.querySelector('input')).not.toBe(input);
    expect(input.value).toBe('edited');
  });

  it.each(['false', 'throw'] as const)(
    'should leave captured state unpublished when activation fails (%s)',
    (failure) => {
      const { root, replay } = fixture(
        '<section data-skip-hydrate><input value="seed"></section>',
        () => {
          if (failure === 'throw') throw new Error('activation rejected');
          return false;
        }
      );
      replay.registerDeferredBoundaries([root.firstElementChild!]);
      const input = root.querySelector('input')!;
      const observed: string[] = [];
      input.value = 'edited';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = 'seed';
      input.addEventListener('input', () => observed.push(input.value));

      replay.complete();

      expect(observed).toEqual([]);
      expect(input.value).toBe('seed');
    }
  );

  it('should preserve an edit when hydration leaves its native value unchanged', () => {
    const { root, replay } = fixture('<input>');
    const input = root.querySelector('input')!;
    const observed: string[] = [];
    input.value = 'edited';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.addEventListener('input', () => observed.push(input.value));
    replay.complete();
    expect(observed).toEqual(['edited']);
  });

  it('should replay file changes without assigning the file input value', () => {
    const { root, replay } = fixture('<input type="file">');
    const input = root.querySelector('input')!;
    let assignments = 0;
    let changes = 0;
    Object.defineProperty(input, 'value', {
      get: () => 'C:\\fakepath\\report.txt',
      set: () => {
        assignments += 1;
      },
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.addEventListener('change', () => {
      changes += 1;
    });
    replay.complete();
    expect(changes).toBe(1);
    expect(assignments).toBe(0);
  });

  it.each(['input', 'textarea', 'checkbox'] as const)(
    'should preserve a queued %s edit through the public hydration API',
    async (kind) => {
      const { container: root, cleanup } = createTestContainer();
      cleanups.push(cleanup);
      const observed: Array<string | boolean> = [];
      const onEdit = (event: Event) =>
        observed.push(
          kind === 'checkbox'
            ? (event.target as HTMLInputElement).checked
            : (event.target as HTMLInputElement | HTMLTextAreaElement).value
        );
      const Page = () =>
        kind === 'textarea' ? (
          <textarea value="seed" onInput={onEdit} />
        ) : kind === 'checkbox' ? (
          <input type="checkbox" checked={false} onChange={onEdit} />
        ) : (
          <input value="seed" onInput={onEdit} />
        );
      root.innerHTML = renderToStringSync(Page);
      const control = root.querySelector('input,textarea') as
        | HTMLInputElement
        | HTMLTextAreaElement;
      const hydration = hydrateSPA({
        root,
        registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
      });
      if (kind === 'checkbox') (control as HTMLInputElement).checked = true;
      else control.value = 'edited';
      control.dispatchEvent(
        new Event(kind === 'checkbox' ? 'change' : 'input', { bubbles: true })
      );

      await hydration;

      expect(root.querySelector('input,textarea')).toBe(control);
      expect(observed).toEqual([kind === 'checkbox' ? true : 'edited']);
    }
  );
});
