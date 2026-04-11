# Forms Guide

Patterns for building forms in Askr with `askr-ui` primitives.

> This guide is a work in progress.

## What this covers

- Controlled inputs with `state()`
- Field and label composition
- Validation patterns
- Form submission and async feedback
- Error display

## Typical form structure

```tsx
import { state } from '@askrjs/askr';
import { Field, FieldLabel } from '@askrjs/askr-ui/field';
import { Input } from '@askrjs/askr-ui/input';
import { Button } from '@askrjs/askr-ui/button';

function SettingsForm() {
  const [name, setName] = state('');
  const [error, setError] = state('');

  const submit = () => {
    if (!name().trim()) {
      setError('Name is required.');
      return;
    }
    // submit logic
  };

  return (
    <form>
      <Field id="name">
        <FieldLabel fieldId="name">Full name</FieldLabel>
        <Input
          value={name()}
          onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
        />
      </Field>
      {error() && <p role="alert">{error()}</p>}
      <Button onPress={submit}>Save</Button>
    </form>
  );
}
```

## See also

- [Core: data](../core/data.md)
- [UI: composition](../ui/composition.md)
- [Guide: CRUD](./crud.md)
