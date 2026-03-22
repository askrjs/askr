Perfect — this is where you **lock the library in**.

Below are the **non-negotiable rules** for askr-ui, followed by a **copy-paste component template** every component must start from.

---

# askr-ui Component Rules

## 1. Components Only

- ✅ Export **components**
- ❌ No hooks
- ❌ No factories
- ❌ No render props

```ts
// GOOD
export function Dialog() {}
export function DialogTrigger() {}

// BAD
useDialog()
createDialog()
<Dialog>{(state) => …}</Dialog>
```

---

## 2. Root Owns State

- Exactly **one root component** owns all state
- State is exposed internally via context
- Subcomponents must never create their own state

```tsx
<Dialog>
  {' '}
  // owns state
  <DialogTrigger /> // reads state
  <DialogContent /> // reads state
</Dialog>
```

---

## 3. Context Is Internal

- Context objects are **private**
- Context accessors are **private**
- Misuse throws immediately

```ts
// internal only
readDialogContext();
```

No silent no-ops.

---

## 4. Slot-Based Composition

- Subcomponents render via `<Slot />`
- `asChild` / slot behavior is mandatory
- No forced DOM elements

```tsx
<DialogTrigger asChild>
  <button />
</DialogTrigger>
```

---

## 5. Deterministic Effects Only

- No timers
- No layout reads
- No async side effects
- All behavior runs in scheduler-safe events

---

## 6. Accessibility Is Automatic

- ARIA attributes are applied internally
- Users cannot forget to wire labels
- Broken ARIA is a bug

---

## 7. Controlled + Uncontrolled Always

- Every stateful root supports:
  - `open`
  - `defaultOpen`
  - `onOpenChange`

- Behavior is identical in both modes

---

## 8. Presence Is Explicit

- Mount only when active
- Unmount deterministically
- No animation coupling

---

## 9. No Styling, Ever

- No classes
- No inline styles
- No CSS variables

---

## 10. Fail Fast

- Invalid nesting throws
- Missing root throws
- Incorrect usage is loud

---

# askr-ui Component Template (Copy-Paste)

```tsx
// component.tsx

import { createContext, readContext } from '@fgrzl/askr';
import { Slot } from '../slot';

/* ---------------------------------------------
 * Context (PRIVATE)
 * ------------------------------------------- */

interface ExampleState {
  open: () => boolean;
  setOpen(next: boolean): void;
}

const ExampleContext = createContext<ExampleState>();

function readExampleContext(): ExampleState {
  const ctx = readContext(ExampleContext);
  if (!ctx) {
    throw new Error('Example components must be used within <Example>');
  }
  return ctx;
}

/* ---------------------------------------------
 * Root
 * ------------------------------------------- */

export interface ExampleProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: unknown;
}

export function Example(props: ExampleProps) {
  const [open, setOpen] = createControllableState(
    props.open,
    props.defaultOpen ?? false,
    props.onOpenChange
  );

  const state: ExampleState = {
    open,
    setOpen,
  };

  return (
    <ExampleContext.Provider value={state}>
      {props.children}
    </ExampleContext.Provider>
  );
}

/* ---------------------------------------------
 * Subcomponents
 * ------------------------------------------- */

export interface ExampleTriggerProps {
  asChild?: boolean;
  children?: unknown;
}

export function ExampleTrigger(props: ExampleTriggerProps) {
  const example = readExampleContext();

  return (
    <Slot
      {...props}
      onClick={() => example.setOpen(true)}
      aria-expanded={example.open()}
    />
  );
}

export function ExampleContent(props) {
  const example = readExampleContext();

  if (!example.open()) return null;

  return <Slot {...props} role="dialog" />;
}
```

---

## Mandatory Checklist Before Merge

Every component PR must answer **yes** to all:

- [ ] Root owns all state
- [ ] Subcomponents are stateless
- [ ] No `use*` APIs
- [ ] Context is private
- [ ] Slot-based
- [ ] ARIA wired
- [ ] Controlled + uncontrolled
- [ ] Deterministic mount/unmount
- [ ] Fails loudly on misuse

---

## Why this works

This template:

- Scales from **Button → Dialog → DataGrid**
- Is AI-friendly (Copilot will follow it)
- Prevents accidental React-isms
- Makes askr-ui _feel like a real UI library_

If you want next:

- Turn this into a **lint rule**
- Define **v1 component cut-line**
- Apply this template to `Dialog` fully
