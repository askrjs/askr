import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

function selectedValues(select: HTMLSelectElement): string[] {
  return Array.from(select.selectedOptions, (option) => option.value);
}

describe('controlled form hydration', () => {
  it('should adopt native controls in place and restore their state before updates', async () => {
    const { container, cleanup } = createTestContainer();
    let submitted = '';

    function Form() {
      const name = state('Ada');
      const notes = state('first programmer');
      const enabled = state(true);
      const contact = state('phone');
      const role = state('admin');
      const permissions = state<readonly string[]>(['read', 'write']);

      return (
        <form
          data-hydrated-form={'true'}
          onSubmit={(event: Event) => {
            event.preventDefault();
            submitted = [
              name(),
              notes(),
              enabled(),
              contact(),
              role(),
              permissions().join(','),
            ].join('|');
          }}
        >
          <input
            data-hydrated-control={'name'}
            value={name()}
            onInput={(event: Event) =>
              name.set((event.currentTarget as HTMLInputElement).value)
            }
          />
          <textarea
            data-hydrated-control={'notes'}
            value={notes()}
            onInput={(event: Event) =>
              notes.set((event.currentTarget as HTMLTextAreaElement).value)
            }
          />
          <input
            data-hydrated-control={'enabled'}
            type={'checkbox'}
            checked={enabled()}
            onChange={(event: Event) =>
              enabled.set((event.currentTarget as HTMLInputElement).checked)
            }
          />
          <input
            data-hydrated-control={'email'}
            type={'radio'}
            name={'contact'}
            value={'email'}
            checked={contact() === 'email'}
            onChange={(event: Event) =>
              contact.set((event.currentTarget as HTMLInputElement).value)
            }
          />
          <input
            data-hydrated-control={'phone'}
            type={'radio'}
            name={'contact'}
            value={'phone'}
            checked={contact() === 'phone'}
            onChange={(event: Event) =>
              contact.set((event.currentTarget as HTMLInputElement).value)
            }
          />
          <select
            data-hydrated-control={'role'}
            value={role()}
            onChange={(event: Event) =>
              role.set((event.currentTarget as HTMLSelectElement).value)
            }
          >
            <option value={'viewer'}>{'Viewer'}</option>
            <option value={'admin'}>{'Admin'}</option>
          </select>
          <select
            data-hydrated-control={'permissions'}
            multiple={true}
            value={permissions()}
            onChange={(event: Event) =>
              permissions.set(
                selectedValues(event.currentTarget as HTMLSelectElement)
              )
            }
          >
            <option value={'read'}>{'Read'}</option>
            <option value={'write'}>{'Write'}</option>
            <option value={'audit'}>{'Audit'}</option>
          </select>
          <button type={'submit'}>{'Save'}</button>
        </form>
      );
    }

    try {
      container.innerHTML = renderToStringSync(Form);
      const original = {
        form: container.querySelector(
          '[data-hydrated-form]'
        ) as HTMLFormElement,
        name: container.querySelector(
          '[data-hydrated-control="name"]'
        ) as HTMLInputElement,
        notes: container.querySelector(
          '[data-hydrated-control="notes"]'
        ) as HTMLTextAreaElement,
        enabled: container.querySelector(
          '[data-hydrated-control="enabled"]'
        ) as HTMLInputElement,
        email: container.querySelector(
          '[data-hydrated-control="email"]'
        ) as HTMLInputElement,
        phone: container.querySelector(
          '[data-hydrated-control="phone"]'
        ) as HTMLInputElement,
        role: container.querySelector(
          '[data-hydrated-control="role"]'
        ) as HTMLSelectElement,
        permissions: container.querySelector(
          '[data-hydrated-control="permissions"]'
        ) as HTMLSelectElement,
        submit: container.querySelector('button') as HTMLButtonElement,
      };

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: Form }]),
      });

      expect(container.querySelector('[data-hydrated-form]')).toBe(
        original.form
      );
      expect(container.querySelector('[data-hydrated-control="name"]')).toBe(
        original.name
      );
      expect(container.querySelector('[data-hydrated-control="notes"]')).toBe(
        original.notes
      );
      expect(container.querySelector('[data-hydrated-control="enabled"]')).toBe(
        original.enabled
      );
      expect(container.querySelector('[data-hydrated-control="email"]')).toBe(
        original.email
      );
      expect(container.querySelector('[data-hydrated-control="phone"]')).toBe(
        original.phone
      );
      expect(container.querySelector('[data-hydrated-control="role"]')).toBe(
        original.role
      );
      expect(
        container.querySelector('[data-hydrated-control="permissions"]')
      ).toBe(original.permissions);
      expect(container.querySelector('button')).toBe(original.submit);

      expect(original.name.value).toBe('Ada');
      expect(original.notes.value).toBe('first programmer');
      expect(original.enabled.checked).toBe(true);
      expect(original.email.checked).toBe(false);
      expect(original.phone.checked).toBe(true);
      expect(original.role.value).toBe('admin');
      expect(selectedValues(original.permissions)).toEqual(['read', 'write']);

      original.name.focus();
      original.name.value = 'Ada Lovelace';
      original.name.setSelectionRange(4, 4);
      original.name.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();

      expect(container.querySelector('[data-hydrated-control="name"]')).toBe(
        original.name
      );
      expect(document.activeElement).toBe(original.name);
      expect([
        original.name.selectionStart,
        original.name.selectionEnd,
      ]).toEqual([4, 4]);

      original.form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      expect(submitted).toBe(
        'Ada Lovelace|first programmer|true|phone|admin|read,write'
      );
    } finally {
      cleanup();
    }
  });
});
