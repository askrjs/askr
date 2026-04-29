# Foundations: Pit of Success Guide

This document demonstrates correct usage patterns and shows how misuse is prevented by design.

## Core Principle

**Foundations define the ONLY way to implement behavior. Components compose foundations, they don't re-implement them.**

---

## 1. applyInteractionPolicy - The Button Law

### âœ… CORRECT: Single entry point for all button-like interactions

```typescript
import { applyInteractionPolicy } from '@askrjs/ui/foundations';

function Button({ onPress, disabled }) {
  const interaction = applyInteractionPolicy({
    isNative: true,
    disabled,
    onPress,
  });

  return <button {...interaction}>Click me</button>;
}
```

### âŒ PREVENTED: Bypassing the policy

```typescript
// âŒ NO! Don't check disabled yourself
function Button({ disabled, onPress }) {
  if (disabled) return null; // Policy handles this!

  const interaction = applyInteractionPolicy({ ... });
}

// âŒ NO! Don't add custom keyboard handlers
function Button({ onPress }) {
  const interaction = applyInteractionPolicy({ ... });
  return (
    <button
      {...interaction}
      onKeyDown={(e) => { /* NO! */ }}
    >
      Click
    </button>
  );
}

// âŒ NO! Don't use onClick directly
function Button({ onPress }) {
  return <button onClick={onPress}>Click</button>;
  // Policy owns interaction semantics!
}
```

---

## 2. dismissable - The ONLY Dismissal Primitive

### âœ… CORRECT: Single dismissal foundation

```typescript
import { dismissable } from '@askrjs/ui/foundations';

function Dialog({ onClose, open }) {
  const dialogRef = ref<HTMLDivElement>();

  const dismiss = dismissable({
    node: dialogRef.current,
    disabled: !open,
    onDismiss: (trigger) => {
      console.log('Closed via:', trigger); // 'escape' or 'outside'
      onClose();
    },
  });

  return open ? (
    <div ref={dialogRef} {...dismiss}>
      Dialog content
    </div>
  ) : null;
}
```

### âŒ PREVENTED: Creating custom dismissal logic

```typescript
// âŒ NO! Don't create your own escape handler
function Dialog({ onClose }) {
  return (
    <div onKeyDown={(e) => {
      if (e.key === 'Escape') onClose(); // NO! Use dismissable
    }}>
      Content
    </div>
  );
}

// âŒ NO! Don't check disabled yourself
function Dialog({ onClose, disabled }) {
  const dismiss = dismissable({ onDismiss: onClose, disabled });

  // âŒ Don't add additional disabled check
  if (disabled) return null; // dismissable handles this!

  return <div {...dismiss}>Content</div>;
}
```

---

## 3. rovingFocus - Single Tab Stop Navigation

### âœ… CORRECT: Composable props

```typescript
import { rovingFocus } from '@askrjs/ui/foundations';

function Menu() {
  const [currentIndex, setCurrentIndex] = state(0);
  const items = ['File', 'Edit', 'View'];

  const roving = rovingFocus({
    currentIndex: currentIndex(),
    itemCount: items.length,
    orientation: 'horizontal',
    loop: true,
    onNavigate: setCurrentIndex,
  });

  return (
    <div {...roving.container}>
      {items.map((label, index) => (
        <button {...roving.item(index)}>
          {label}
        </button>
      ))}
    </div>
  );
}
```

### âŒ PREVENTED: Custom arrow key handling

```typescript
// âŒ NO! Don't implement your own arrow navigation
function Menu() {
  const roving = rovingFocus({ ... });

  return (
    <div
      {...roving.container}
      onKeyDown={(e) => {
        // NO! rovingFocus owns arrow navigation
        if (e.key === 'ArrowRight') { ... }
      }}
    >
      {items.map(...)}
    </div>
  );
}

// âŒ NO! Don't manage tabIndex yourself
function Menu() {
  const roving = rovingFocus({ ... });

  return (
    <div {...roving.container}>
      <button
        {...roving.item(0)}
        tabIndex={0} // NO! roving.item sets tabIndex
      >
        Item
      </button>
    </div>
  );
}
```

---

## 4. Composition via mergeProps

### âœ… CORRECT: Foundations compose automatically

```typescript
import {
  applyInteractionPolicy,
  dismissable,
  mergeProps,
} from '@askrjs/ui/foundations';

function DialogButton({ onPress, onClose, disabled }) {
  const interaction = applyInteractionPolicy({
    isNative: true,
    disabled,
    onPress,
  });

  const dismiss = dismissable({
    disabled,
    onDismiss: onClose,
  });

  // Both foundations compose via mergeProps
  const props = mergeProps(interaction, dismiss);

  return <button {...props}>Close Dialog</button>;
}
```

### âœ… CORRECT: User handlers compose with foundation handlers

```typescript
function Button({ onPress, disabled }) {
  const interaction = applyInteractionPolicy({
    isNative: true,
    disabled,
    onPress,
  });

  // User handler composes with policy
  return (
    <button
      {...interaction}
      onClick={(e) => {
        console.log('Before policy handler');
        // Policy handler will run after
      }}
    >
      Click
    </button>
  );
}
```

---

## 5. createCollection - Ordered Registry

### âœ… CORRECT: Explicit lifecycle management

```typescript
import { createCollection } from '@askrjs/askr/foundations';

function TabList() {
  const tabs = createCollection<HTMLElement, { disabled: boolean }>();

  function TabItem({ label, disabled }) {
    const ref = ref<HTMLButtonElement>();

    onMount(() => {
      const unregister = tabs.register(ref.current, { disabled });
      onUnmount(unregister);
    });

    return <button ref={ref}>{label}</button>;
  }

  // Query all enabled tabs
  const enabledTabs = tabs.items().filter(item => !item.metadata.disabled);
}
```

### âŒ PREVENTED: Implicit global state (doesn't exist)

```typescript
// âŒ NO! Don't create implicit registries
// There is no global registry - you MUST create one explicitly
const tabs = createCollection(); // Explicit, scoped, controlled
```

---

## 6. createLayer - Stacking Coordination

### âœ… CORRECT: Explicit layer management

```typescript
import { createLayer } from '@askrjs/askr/foundations';

const layerManager = createLayer();

function Modal({ onClose }) {
  const modalRef = ref<HTMLDivElement>();

  const layer = layerManager.register({
    node: modalRef.current,
    onEscape: onClose,
    onOutsidePointer: onClose,
  });

  onUnmount(() => layer.unregister());

  return (
    <div ref={modalRef}>
      {layer.isTop() && <div>Top layer indicator</div>}
      Modal content
    </div>
  );
}
```

---

## Success Checklist

For each foundation, verify:

- âœ… **Can't bypass**: No way to implement behavior without the foundation
- âœ… **Can't duplicate**: Checking disabled/handling keys elsewhere is prevented
- âœ… **Composes via mergeProps**: All foundations return standard props
- âœ… **Type safe**: Invalid usage caught by TypeScript
- âœ… **Reads like English**: API is self-documenting
- âœ… **Pit of success**: Right thing is easier than wrong thing

---

## Building Components

### Button (Complete Example)

```typescript
import { applyInteractionPolicy } from '@askrjs/ui/foundations';

export function Button({
  onPress,
  disabled = false,
  children
}) {
  // THE ONLY interaction logic
  const interaction = applyInteractionPolicy({
    isNative: true,
    disabled,
    onPress,
  });

  return <button {...interaction}>{children}</button>;
}
```

### Dialog (Complete Example)

```typescript
import { dismissable } from '@askrjs/ui/foundations';
import { Presence } from '@askrjs/askr/foundations';

export function Dialog({
  open,
  onClose,
  children
}) {
  const dialogRef = ref<HTMLDivElement>();

  // THE ONLY dismissal logic
  const dismiss = dismissable({
    node: dialogRef.current,
    disabled: !open,
    onDismiss: () => onClose(),
  });

  return (
    <Presence present={open}>
      <div ref={dialogRef} role="dialog" {...dismiss}>
        {children}
      </div>
    </Presence>
  );
}
```

### Menu (Complete Example)

```typescript
import {
  rovingFocus,
  applyInteractionPolicy
} from '@askrjs/ui/foundations';

export function Menu({ items, onSelect }) {
  const [currentIndex, setCurrentIndex] = state(0);

  const roving = rovingFocus({
    currentIndex: currentIndex(),
    itemCount: items.length,
    orientation: 'vertical',
    loop: true,
    onNavigate: setCurrentIndex,
  });

  return (
    <div role="menu" {...roving.container}>
      {items.map((item, index) => {
        const interaction = applyInteractionPolicy({
          isNative: false,
          disabled: item.disabled,
          onPress: () => onSelect(item),
        });

        return (
          <div
            {...roving.item(index)}
            {...interaction}
            role="menuitem"
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
```

---

## The Guarantee

**If you use foundations correctly, your components will:**

1. âœ… Be accessible by default
2. âœ… Handle keyboard correctly
3. âœ… Respect disabled state consistently
4. âœ… Compose without conflicts
5. âœ… Never duplicate logic
6. âœ… Be easy for AI to generate

**The pit of success works.**
