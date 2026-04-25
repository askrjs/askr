/** @jsxImportSource @askrjs/askr */

import { state } from '@askrjs/askr';
import { createIsland } from '@askrjs/askr/boot';

function valueFrom(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

function checkedFrom(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}

export function AccountSettingsForm() {
  const [name, setName] = state('');
  const [email, setEmail] = state('');
  const [newsletter, setNewsletter] = state(false);
  const [role, setRole] = state('viewer');
  const [contactMethod, setContactMethod] = state('email');
  const [error, setError] = state('');
  const [message, setMessage] = state('');
  const [pending, setPending] = state(false);

  const resetForm = () => {
    setName('');
    setEmail('');
    setNewsletter(false);
    setRole('viewer');
    setContactMethod('email');
    setError('');
    setMessage('');
    setPending(false);
  };

  const saveSettings = (event: Event) => {
    event.preventDefault();
    setMessage('');

    if (!name().trim()) {
      setError('Name is required.');
      return;
    }

    if (!email().includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setError('');
    setPending(true);

    window.setTimeout(() => {
      setPending(false);
      setMessage(`Saved account settings for ${name().trim()}.`);
    }, 250);
  };

  return (
    <section aria-label="Account settings page">
      <h2>Account settings</h2>
      <form
        aria-label="Account settings"
        noValidate={true}
        onSubmit={saveSettings}
      >
        <label>
          Full name
          <input
            type="text"
            value={name()}
            onInput={(event: Event) => setName(valueFrom(event))}
          />
        </label>

        <label>
          Email address
          <input
            type="email"
            value={email()}
            onInput={(event: Event) => setEmail(valueFrom(event))}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={newsletter()}
            onChange={(event: Event) => setNewsletter(checkedFrom(event))}
          />
          Receive product updates
        </label>

        <label>
          Account role
          <select
            value={role()}
            onChange={(event: Event) => setRole(valueFrom(event))}
          >
            <option value="viewer">Viewer</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <fieldset>
          <legend>Preferred contact</legend>
          <label>
            <input
              type="radio"
              name="contact-method"
              value="email"
              checked={contactMethod() === 'email'}
              onChange={(event: Event) => setContactMethod(valueFrom(event))}
            />
            Email
          </label>
          <label>
            <input
              type="radio"
              name="contact-method"
              value="phone"
              checked={contactMethod() === 'phone'}
              onChange={(event: Event) => setContactMethod(valueFrom(event))}
            />
            Phone
          </label>
        </fieldset>

        <p aria-label="Settings preview">
          {name().trim()
            ? `${name().trim()} will be saved as ${role()} with ${contactMethod()} contact.`
            : 'Enter account details to preview changes.'}
        </p>

        <p role="alert" hidden={!error()}>
          {error()}
        </p>
        <p role="status" hidden={!message()}>
          {message()}
        </p>

        <button type="submit" disabled={pending()}>
          {pending() ? 'Saving...' : 'Save changes'}
        </button>
        <button type="button" onClick={resetForm}>
          Reset
        </button>
      </form>
    </section>
  );
}

export function mountFormsScenario(root: HTMLElement): void {
  createIsland({ root, component: AccountSettingsForm });
}
