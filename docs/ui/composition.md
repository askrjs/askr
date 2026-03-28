# UI: Composition

Patterns for composing `askr-ui` primitives into application components.

## Principle

Askr UI is composed, not configured.

Rather than `<Button icon="save" iconPosition="left">`, you compose:

```tsx
import { Button } from '@askrjs/askr-ui/button';
import { SaveIcon } from '@askrjs/askr-lucide';

<Button onPress={save}>
  <SaveIcon size={14} aria-hidden="true" /> Save changes
</Button>;
```

This keeps component APIs narrow. Behavior scales through composition, not prop proliferation.

## Field + Label composition

```tsx
import { Field, FieldLabel } from '@askrjs/askr-ui/field';
import { Input } from '@askrjs/askr-ui/input';

<Field id="email">
  <FieldLabel fieldId="email">Email address</FieldLabel>
  <Input type="email" value={email()} onInput={...} />
</Field>
```

`Field` provides the accessibility binding. `FieldLabel` associates the label. `Input`
provides the control. Each component does one thing.

## Dialog composition

```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogPortal,
  DialogOverlay,
} from '@askrjs/askr-ui/dialog';
import { Button } from '@askrjs/askr-ui/button';

<Dialog>
  <DialogTrigger>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent>
      <DialogTitle>Confirm action</DialogTitle>
      <DialogDescription>This cannot be undone.</DialogDescription>
      <DialogClose>
        <Button>Cancel</Button>
      </DialogClose>
      <Button onPress={confirm}>Confirm</Button>
    </DialogContent>
  </DialogPortal>
</Dialog>;
```

## Select composition

```tsx
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectItem,
} from '@askrjs/askr-ui/select';

<Select value={timezone()} onValueChange={setTimezone}>
  <SelectTrigger aria-label="Timezone">
    <SelectValue placeholder="Select timezone" />
  </SelectTrigger>
  <SelectPortal>
    <SelectContent>
      <SelectItem value="utc">UTC</SelectItem>
      <SelectItem value="pst">Pacific Time</SelectItem>
    </SelectContent>
  </SelectPortal>
</Select>;
```

## See also

- [Components](./components.md)
- [Foundations](./foundations.md)
- [Forms guide](../guides/forms.md)
