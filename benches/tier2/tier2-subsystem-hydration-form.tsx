import { bench, describe, expect } from 'vitest';
import { createHydrationFixture, tier2BenchOptions } from '../shared/_shared';
import { hydrateSPA } from '../../src/boot';
import { state } from '../../src';
import { fireEvent, flushScheduler } from '../../tests/helpers/test-renderer';

function createFormHarness() {
  const initialForm = {
    note: 'Initial note',
    ...Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `text-${index}`,
        `Seed ${index}`,
      ])
    ),
    ...Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `check-${index}`,
        index % 2 === 0,
      ])
    ),
    ...Object.fromEntries(
      Array.from({ length: 19 }, (_, index) => [
        `select-${index}`,
        `option-${index % 3}`,
      ])
    ),
  };

  const routes = [
    {
      path: '/',
      handler: () => {
        const formState = state(initialForm);
        const updateField = (key: string, value: string | boolean) => {
          formState.set({
            ...formState(),
            [key]: value,
          });
        };

        return (
          <form class="hydration-form">
            <fieldset>
              <legend>Profile</legend>
              {Array.from({ length: 20 }, (_, index) => (
                <label for={`form-text-${index}`}>
                  Text {index}
                  <input
                    id={`form-text-${index}`}
                    value={String(formState()[`text-${index}`])}
                    onInput={(event: Event) =>
                      updateField(
                        `text-${index}`,
                        (event.target as HTMLInputElement).value
                      )
                    }
                  />
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Flags</legend>
              {Array.from({ length: 20 }, (_, index) => (
                <label for={`form-check-${index}`}>
                  Check {index}
                  <input
                    id={`form-check-${index}`}
                    type="checkbox"
                    checked={Boolean(formState()[`check-${index}`])}
                    onChange={(event: Event) =>
                      updateField(
                        `check-${index}`,
                        (event.target as HTMLInputElement).checked
                      )
                    }
                  />
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Options</legend>
              {Array.from({ length: 19 }, (_, index) => (
                <label for={`form-select-${index}`}>
                  Select {index}
                  <select
                    id={`form-select-${index}`}
                    value={String(formState()[`select-${index}`])}
                    onChange={(event: Event) =>
                      updateField(
                        `select-${index}`,
                        (event.target as HTMLSelectElement).value
                      )
                    }
                  >
                    <option value="option-0">Option 0</option>
                    <option value="option-1">Option 1</option>
                    <option value="option-2">Option 2</option>
                  </select>
                </label>
              ))}
              <label for="form-note">
                Note
                <textarea
                  id="form-note"
                  value={String(formState().note)}
                  onInput={(event: Event) =>
                    updateField(
                      'note',
                      (event.target as HTMLTextAreaElement).value
                    )
                  }
                />
              </label>
            </fieldset>
            <output id="form-summary">
              {String(formState()['text-0'])}|{String(formState()['select-0'])}|
              {String(formState().note)}
            </output>
          </form>
        );
      },
    },
  ];

  return { routes };
}

await (async () => {
  const harness = createFormHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });

  try {
    await expect(
      hydrateSPA({ root: fixture.container, routes: fixture.routes })
    ).resolves.not.toThrow();
    flushScheduler();

    const textInput = fixture.container.querySelector(
      '#form-text-0'
    ) as HTMLInputElement;
    const selectInput = fixture.container.querySelector(
      '#form-select-0'
    ) as HTMLSelectElement;

    expect(textInput.value).toBe('Seed 0');
    expect(selectInput.value).toBe('option-0');

    fireEvent.input(textInput, 'Updated Name');
    flushScheduler();

    expect(
      fixture.container.querySelector('#form-summary')?.textContent
    ).toContain('Updated Name');
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration form', () => {
  let harness: ReturnType<typeof createFormHarness> | null = null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate a 60-field interactive form',
    async () => {
      fixture!.reset();
      await hydrateSPA({ root: fixture!.container, routes: fixture!.routes });
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        harness = createFormHarness();
        fixture = createHydrationFixture({ routes: harness.routes });
      },
      teardown() {
        fixture?.cleanup();
        fixture = null;
        harness = null;
      },
    }
  );
});
