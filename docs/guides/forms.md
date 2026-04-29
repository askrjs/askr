# Forms Guide

Patterns for building forms in Askr with `state()` and headless UI primitives.

Use local state for draft values, validate before submit, and keep API calls at
the route or feature-container boundary.

## Typical Form Structure

```tsx
import { state } from '@askrjs/askr';
import { Button, Field, FieldLabel, Input } from '@askrjs/ui';

export function SettingsForm() {
  const [name, setName] = state('');
  const [error, setError] = state('');

  const submit = () => {
    if (!name().trim()) {
      setError('Name is required.');
      return;
    }

    setError('');
    // Submit at the route or feature boundary.
  };

  return (
    <form>
      <Field id="name">
        <FieldLabel fieldId="name">Full name</FieldLabel>
        <Input
          value={name()}
          onInput={(event: Event) =>
            setName((event.target as HTMLInputElement).value)
          }
        />
      </Field>
      {error() " <p role="alert">{error()}</p> : null}
      <Button onPress={submit}>Save</Button>
    </form>
  );
}
```

## Validation

- Validate required fields before submit.
- Store field-level errors close to the form that renders them.
- Use `role="alert"` for submit-blocking errors that need announcement.

## Common Pitfalls

- Do not fetch directly from generic input or field components.
- Do not mix controlled and uncontrolled values for the same field.
- Keep business validation outside reusable visual primitives.

## See Also

- [Core: data](../core/data.md)
- [UI: composition](https://github.com/askrjs/askr-ui/tree/main/docs/composition.md)
- [Guide: CRUD](./crud.md)
