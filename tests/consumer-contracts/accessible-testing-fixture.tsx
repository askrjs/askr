import { state } from '@askrjs/askr';
import { createQuery } from '@askrjs/askr/data';
import { on } from '@askrjs/askr/resources';

export function makeAccessibleForm(
  prefix: string,
  notified: () => void = () => {}
) {
  return function ProfileForm() {
    const name = state('Ada');
    const saves = state(0);
    const open = state(false);
    let trigger: HTMLButtonElement | null = null;
    on(window, 'askr-accessible-form', notified);
    const dismiss = () => {
      open.set(false);
      trigger?.focus();
    };
    return (
      <section aria-label="Profile editor">
        <h1>{'Profile'}</h1>
        <label htmlFor={`${prefix}-name`}>{'Display name'}</label>
        <p id={`${prefix}-description`}>{'Public name'}</p>
        <input
          id={`${prefix}-name`}
          aria-describedby={`${prefix}-description`}
          value={name()}
          onInput={(event: Event) =>
            name.set((event.currentTarget as HTMLInputElement).value)
          }
        />
        <button type="button" onClick={() => saves.set(saves() + 1)}>
          {'Save'}
        </button>
        <button type="button" disabled onClick={() => saves.set(1000)}>
          {'Unavailable'}
        </button>
        <button
          type="button"
          ref={(element) => {
            trigger = element;
          }}
          onClick={() => open.set(true)}
        >
          {'Open actions'}
        </button>
        {open() && (
          <div
            role="dialog"
            aria-label="Actions"
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === 'Escape') dismiss();
            }}
          >
            <button type="button" onClick={dismiss}>
              {'Close'}
            </button>
          </div>
        )}
        <p role="status">
          {saves() ? `Saved ${name()} (${saves()})` : 'Not saved'}
        </p>
      </section>
    );
  };
}

export function makeAccessibleResults(
  fetch: (signal: AbortSignal) => Promise<string>
) {
  return function Results() {
    const result = createQuery({
      key: 'accessible/results',
      fetch: ({ signal }) => fetch(signal),
    });
    return (
      <section aria-label="Results">
        <h1>{'Results'}</h1>
        <p role="status">
          {result.loading ? 'Loading results' : (result.data ?? 'No results')}
        </p>
        {result.error && <p role="alert">{'Could not load results'}</p>}
        <button
          type="button"
          onClick={() => {
            void result.refresh().catch(() => {});
          }}
        >
          {'Retry'}
        </button>
      </section>
    );
  };
}
