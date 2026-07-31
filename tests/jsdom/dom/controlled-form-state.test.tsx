import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { For, Show } from '../../../src/control';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Submission = {
  name: string;
  notes: string;
  seats: number;
  newsletter: boolean;
  contact: string;
  role: string;
  permissions: string[];
};

function valueFrom(event: Event): string {
  return (
    event.currentTarget as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
  ).value;
}

function checkedFrom(event: Event): boolean {
  return (event.currentTarget as HTMLInputElement).checked;
}

function selectedValuesFrom(event: Event): string[] {
  return Array.from(
    (event.currentTarget as HTMLSelectElement).selectedOptions,
    (option) => option.value
  );
}

describe('controlled form state', () => {
  it('should keep every native control and the latest submit state stable through mixed boundaries', () => {
    const { container, cleanup } = createTestContainer();
    const submissions: Submission[] = [];
    const row = { id: 'settings' };

    function SettingsForm() {
      const name = state('');
      const notes = state('');
      const seats = state(0);
      const newsletter = state(false);
      const contact = state('email');
      const role = state('');
      const permissions = state<readonly string[]>(['read']);

      const reset = () => {
        name.set('');
        notes.set('');
        seats.set(0);
        newsletter.set(false);
        contact.set('email');
        role.set('');
        permissions.set(['read']);
      };

      return (
        <>
          <h2 data-form-heading={'true'}>{'Account settings'}</h2>
          <form
            data-state-form={'true'}
            noValidate={true}
            onSubmit={(event: Event) => {
              event.preventDefault();
              submissions.push({
                name: name(),
                notes: notes(),
                seats: seats(),
                newsletter: newsletter(),
                contact: contact(),
                role: role(),
                permissions: [...permissions()],
              });
            }}
          >
            <label>
              {'Name'}
              <input
                data-control={'name'}
                required={true}
                aria-invalid={name().trim() ? 'false' : 'true'}
                value={name()}
                onInput={(event: Event) => name.set(valueFrom(event))}
              />
            </label>
            <label>
              {'Notes'}
              <textarea
                data-control={'notes'}
                value={notes()}
                onInput={(event: Event) => notes.set(valueFrom(event))}
              />
            </label>
            <label>
              {'Seats'}
              <input
                data-control={'seats'}
                type={'number'}
                value={seats()}
                onInput={(event: Event) => seats.set(Number(valueFrom(event)))}
              />
            </label>
            <label>
              <input
                data-control={'newsletter'}
                type={'checkbox'}
                checked={newsletter()}
                onChange={(event: Event) => newsletter.set(checkedFrom(event))}
              />
              {'Newsletter'}
            </label>
            <fieldset>
              <legend>{'Contact'}</legend>
              <label>
                <input
                  data-control={'contact-email'}
                  type={'radio'}
                  name={'contact'}
                  value={'email'}
                  checked={contact() === 'email'}
                  onChange={(event: Event) => contact.set(valueFrom(event))}
                />
                {'Email'}
              </label>
              <label>
                <input
                  data-control={'contact-phone'}
                  type={'radio'}
                  name={'contact'}
                  value={'phone'}
                  checked={contact() === 'phone'}
                  onChange={(event: Event) => contact.set(valueFrom(event))}
                />
                {'Phone'}
              </label>
            </fieldset>
            <label>
              {'Role'}
              <select
                data-control={'role'}
                required={true}
                value={role()}
                onChange={(event: Event) => role.set(valueFrom(event))}
              >
                <option value={''}>{'Choose a role'}</option>
                <option value={'viewer'}>{'Viewer'}</option>
                <option value={'admin'}>{'Admin'}</option>
              </select>
            </label>
            <label>
              {'Permissions'}
              <select
                data-control={'permissions'}
                multiple={true}
                value={permissions()}
                onChange={(event: Event) =>
                  permissions.set(selectedValuesFrom(event))
                }
              >
                <option value={'read'}>{'Read'}</option>
                <option value={'write'}>{'Write'}</option>
                <option value={'audit'}>{'Audit'}</option>
              </select>
            </label>
            <output data-form-summary={'true'}>
              {[
                name(),
                notes(),
                seats(),
                newsletter(),
                contact(),
                role(),
                permissions().join(','),
              ].join('|')}
            </output>
            <button
              data-submit={'true'}
              type={'submit'}
              disabled={!name().trim() || !role()}
            >
              {'Save'}
            </button>
            <button data-reset={'true'} type={'button'} onClick={reset}>
              {'Reset'}
            </button>
          </form>
        </>
      );
    }

    function App() {
      return (
        <main>
          <p data-before={'true'}>{'before'}</p>
          <For each={() => [row]} by={(item) => item.id}>
            {() => <SettingsForm />}
          </For>
          <Show when={true}>
            <p data-after={'true'}>{'after'}</p>
          </Show>
        </main>
      );
    }

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      const original = {
        before: container.querySelector('[data-before]'),
        heading: container.querySelector('[data-form-heading]'),
        form: container.querySelector('[data-state-form]'),
        name: container.querySelector(
          '[data-control="name"]'
        ) as HTMLInputElement,
        notes: container.querySelector(
          '[data-control="notes"]'
        ) as HTMLTextAreaElement,
        seats: container.querySelector(
          '[data-control="seats"]'
        ) as HTMLInputElement,
        newsletter: container.querySelector(
          '[data-control="newsletter"]'
        ) as HTMLInputElement,
        email: container.querySelector(
          '[data-control="contact-email"]'
        ) as HTMLInputElement,
        phone: container.querySelector(
          '[data-control="contact-phone"]'
        ) as HTMLInputElement,
        role: container.querySelector(
          '[data-control="role"]'
        ) as HTMLSelectElement,
        permissions: container.querySelector(
          '[data-control="permissions"]'
        ) as HTMLSelectElement,
        summary: container.querySelector('[data-form-summary]'),
        submit: container.querySelector('[data-submit]') as HTMLButtonElement,
        reset: container.querySelector('[data-reset]') as HTMLButtonElement,
        after: container.querySelector('[data-after]'),
      };

      const expectStableIdentity = () => {
        expect(container.querySelector('[data-before]')).toBe(original.before);
        expect(container.querySelector('[data-form-heading]')).toBe(
          original.heading
        );
        expect(container.querySelector('[data-state-form]')).toBe(
          original.form
        );
        expect(container.querySelector('[data-control="name"]')).toBe(
          original.name
        );
        expect(container.querySelector('[data-control="notes"]')).toBe(
          original.notes
        );
        expect(container.querySelector('[data-control="seats"]')).toBe(
          original.seats
        );
        expect(container.querySelector('[data-control="newsletter"]')).toBe(
          original.newsletter
        );
        expect(container.querySelector('[data-control="contact-email"]')).toBe(
          original.email
        );
        expect(container.querySelector('[data-control="contact-phone"]')).toBe(
          original.phone
        );
        expect(container.querySelector('[data-control="role"]')).toBe(
          original.role
        );
        expect(container.querySelector('[data-control="permissions"]')).toBe(
          original.permissions
        );
        expect(container.querySelector('[data-form-summary]')).toBe(
          original.summary
        );
        expect(container.querySelector('[data-submit]')).toBe(original.submit);
        expect(container.querySelector('[data-reset]')).toBe(original.reset);
        expect(container.querySelector('[data-after]')).toBe(original.after);
      };

      expect(original.form).toBeTruthy();
      expect(original.name.required).toBe(true);
      expect(original.role.required).toBe(true);
      expect(original.name.getAttribute('aria-invalid')).toBe('true');
      expect(original.seats.value).toBe('0');
      expect(original.email.checked).toBe(true);
      expect(original.phone.checked).toBe(false);
      expect(original.role.value).toBe('');
      expect(
        Array.from(
          original.permissions.selectedOptions,
          (option) => option.value
        )
      ).toEqual(['read']);
      expect(original.submit.disabled).toBe(true);

      original.name.focus();
      original.name.value = 'Ada Lovelace';
      original.name.setSelectionRange(3, 8, 'backward');
      original.name.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();

      expectStableIdentity();
      expect(document.activeElement).toBe(original.name);
      expect([
        original.name.selectionStart,
        original.name.selectionEnd,
        original.name.selectionDirection,
      ]).toEqual([3, 8, 'backward']);
      expect(original.name.getAttribute('aria-invalid')).toBe('false');
      expect(original.submit.disabled).toBe(true);

      const expectNameFocus = () => {
        expect(document.activeElement).toBe(original.name);
        expect([
          original.name.selectionStart,
          original.name.selectionEnd,
          original.name.selectionDirection,
        ]).toEqual([3, 8, 'backward']);
      };

      original.seats.value = '3';
      original.seats.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();
      expectStableIdentity();
      expectNameFocus();
      expect(original.seats.value).toBe('3');

      original.newsletter.checked = true;
      original.newsletter.dispatchEvent(new Event('change', { bubbles: true }));
      flushScheduler();
      expectStableIdentity();
      expectNameFocus();
      expect(original.newsletter.checked).toBe(true);

      original.phone.checked = true;
      original.phone.dispatchEvent(new Event('change', { bubbles: true }));
      flushScheduler();
      expectStableIdentity();
      expectNameFocus();
      expect(original.email.checked).toBe(false);
      expect(original.phone.checked).toBe(true);

      original.role.value = 'admin';
      original.role.dispatchEvent(new Event('change', { bubbles: true }));
      flushScheduler();
      expectStableIdentity();
      expectNameFocus();
      expect(original.role.value).toBe('admin');
      expect(original.submit.disabled).toBe(false);

      for (const option of Array.from(original.permissions.options)) {
        option.selected = option.value === 'read' || option.value === 'write';
      }
      original.permissions.dispatchEvent(
        new Event('change', { bubbles: true })
      );
      flushScheduler();
      expectStableIdentity();
      expectNameFocus();
      expect(
        Array.from(
          original.permissions.selectedOptions,
          (option) => option.value
        )
      ).toEqual(['read', 'write']);

      original.notes.focus();
      original.notes.value = 'compiler notes';
      original.notes.setSelectionRange(2, 9, 'backward');
      original.notes.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();

      expectStableIdentity();
      expect(document.activeElement).toBe(original.notes);
      expect([
        original.notes.selectionStart,
        original.notes.selectionEnd,
        original.notes.selectionDirection,
      ]).toEqual([2, 9, 'backward']);

      original.newsletter.checked = false;
      original.newsletter.dispatchEvent(new Event('change', { bubbles: true }));
      flushScheduler();
      expectStableIdentity();
      expect(document.activeElement).toBe(original.notes);
      expect([
        original.notes.selectionStart,
        original.notes.selectionEnd,
        original.notes.selectionDirection,
      ]).toEqual([2, 9, 'backward']);

      original.form!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      expect(submissions).toEqual([
        {
          name: 'Ada Lovelace',
          notes: 'compiler notes',
          seats: 3,
          newsletter: false,
          contact: 'phone',
          role: 'admin',
          permissions: ['read', 'write'],
        },
      ]);
      expect(original.summary?.textContent).toBe(
        'Ada Lovelace|compiler notes|3|false|phone|admin|read,write'
      );

      original.reset.click();
      flushScheduler();
      expectStableIdentity();
      expect(original.name.value).toBe('');
      expect(original.notes.value).toBe('');
      expect(original.seats.value).toBe('0');
      expect(original.newsletter.checked).toBe(false);
      expect(original.email.checked).toBe(true);
      expect(original.phone.checked).toBe(false);
      expect(original.role.value).toBe('');
      expect(
        Array.from(
          original.permissions.selectedOptions,
          (option) => option.value
        )
      ).toEqual(['read']);
      expect(original.submit.disabled).toBe(true);
      expect(original.name.getAttribute('aria-invalid')).toBe('true');
    } finally {
      cleanup();
    }
  });

  it('should not rewrite a controlled input value already reflected by the DOM', () => {
    const { container, cleanup } = createTestContainer();
    let bump!: () => void;
    let setName!: (value: string) => void;

    function Editor() {
      const name = state('Ada');
      const revision = state(0);
      bump = () => revision.set((value) => value + 1);
      setName = name.set;

      return (
        <section>
          <input
            data-echo-input={'true'}
            value={name()}
            onInput={(event: Event) => name.set(valueFrom(event))}
          />
          <output>{revision()}</output>
        </section>
      );
    }

    try {
      createIsland({ root: container, component: Editor });
      flushScheduler();

      const input = container.querySelector(
        '[data-echo-input]'
      ) as HTMLInputElement;
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      );
      if (!descriptor?.get || !descriptor.set) {
        throw new Error('expected the native input value descriptor');
      }

      let valueWrites = 0;
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: () => descriptor.get!.call(input) as string,
        set: (value: string) => {
          valueWrites += 1;
          descriptor.set!.call(input, value);
        },
      });

      input.focus();
      input.setSelectionRange(1, 2, 'forward');
      bump();
      flushScheduler();

      expect(valueWrites).toBe(0);
      expect(document.activeElement).toBe(input);
      expect([
        input.selectionStart,
        input.selectionEnd,
        input.selectionDirection,
      ]).toEqual([1, 2, 'forward']);

      input.value = 'Ada Lovelace';
      input.setSelectionRange(4, 4);
      valueWrites = 0;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();

      expect(valueWrites).toBe(0);
      expect(container.querySelector('[data-echo-input]')).toBe(input);
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([4, 4]);

      setName('Grace');
      flushScheduler();
      expect(valueWrites).toBe(1);
      expect(input.value).toBe('Grace');
      expect(container.querySelector('[data-echo-input]')).toBe(input);
    } finally {
      cleanup();
    }
  });
});
