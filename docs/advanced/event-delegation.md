# Event Delegation

Event delegation is an optimization that reduces memory usage and improves performance by attaching a single event listener at a container level (by default `document.body`) instead of individual listeners on each element.

## How It Works

When event delegation is enabled (the default), Askr automatically delegates these event types:

- **Mouse events**: `click`, `dblclick`, `mousedown`, `mouseup`, `mousemove`
- **Pointer events**: `pointerdown`, `pointerup`, `pointermove`, `pointercancel`
- **Touch events**: `touchstart`, `touchend`, `touchmove`, `touchcancel`
- **Keyboard events**: `keydown`, `keyup`, `keypress`
- **Focus events**: `focusin`, `focusout`
- **Form events**: `input`, `change`, `submit`, `reset`

Non-delegated events (e.g., `scroll`, `load`) attach listeners directly to elements.

## API

### Control Delegation

```typescript
import {
  enableEventDelegation,
  disableEventDelegation,
  isEventDelegationEnabled,
} from '@askrjs/askr';

// Disable delegation globally
disableEventDelegation();

// Re-enable delegation
enableEventDelegation();

// Check if delegation is enabled
if (isEventDelegationEnabled()) {
  console.log('Delegation active');
}
```

### Custom Delegation Container

By default, delegated listeners attach to `document.body`. You can change this:

```typescript
import { setGlobalDelegationContainer } from '@askrjs/askr/runtime/events';

const customContainer = document.getElementById('app-root');
setGlobalDelegationContainer(customContainer!);
```

**When to use a custom container:**

- Shadow DOM boundaries
- Iframe integration
- Isolated widget environments

## Usage

### Basic Example

```tsx
import { createIsland, state } from '@askrjs/askr';

function Counter() {
  const count = state(0);

  return (
    <div>
      <button onClick={() => count.set(count() + 1)}>Count: {count()}</button>
    </div>
  );
}

createIsland({ root: document.body, component: Counter });
```

The `onClick` handler is automatically delegated - no direct listener is attached to the button.

### Event Propagation

Delegated events support standard event propagation:

```tsx
function Parent() {
  return (
    <div onClick={() => console.log('Parent clicked')}>
      <button
        onClick={(e) => {
          console.log('Button clicked');
          e.stopPropagation(); // Prevents parent handler from firing
        }}
      >
        Click me
      </button>
    </div>
  );
}
```

### State Updates

Delegated event handlers integrate with Askr's scheduler. State updates are batched and applied after the event handler completes:

```tsx
function BatchedUpdates() {
  const count1 = state(0);
  const count2 = state(0);

  return (
    <button
      onClick={() => {
        count1.set(count1() + 1);
        count2.set(count2() + 1);
        // Both updates batched - single re-render
      }}
    >
      Update Both
    </button>
  );
}
```

## Performance Characteristics

### Benefits

1. **Memory efficiency**: One delegated listener instead of N individual listeners
2. **Dynamic content**: New elements automatically inherit delegation without setup
3. **Cleanup**: Simpler memory management

### Overhead

- **Event bubbling**: Small cost for events to bubble to delegation container
- **Target matching**: Minimal cost to find handler for target element

For most applications, delegation is faster overall due to reduced memory allocation and cleanup.

## Opt-Out

Disable delegation for specific use cases:

```typescript
import { disableEventDelegation } from '@askrjs/askr';

// Before creating islands
disableEventDelegation();

createIsland({ root: container, component: MyComponent });
```

Existing islands continue to use their initial delegation mode. Call `disable` before mounting components.

## Edge Cases

### Custom Events

Custom events are NOT delegated:

```tsx
<button onClick={() => console.log('Delegated')}>Standard</button>
```

Use `onEventName` for standard events. For custom events, use refs:

```tsx
function CustomEventComponent() {
  const btnRef = { current: null };

  onMount(() => {
    if (btnRef.current) {
      btnRef.current.addEventListener('customEvent', handler);
    }
    return () => btnRef.current?.removeEventListener('customEvent', handler);
  });

  return <button ref={btnRef}>Custom</button>;
}
```

### Capture Phase

Delegated events use the bubble phase. For capture phase listeners, attach directly:

```tsx
onMount(() => {
  element.addEventListener('click', handler, { capture: true });
});
```

## Troubleshooting

### Event not firing

1. **Check delegation is enabled**: Call `isEventDelegationEnabled()`
2. **Verify event type is delegated**: See list above
3. **Check stopPropagation**: Earlier handlers might prevent bubbling

### Performance issues

1. **Too many handlers**: Consider using a single handler with logic
2. **Large delegation container**: Use a custom container closer to your elements
3. **Excessive bubbling**: Opt out of delegation for deeply nested structures

## Best Practices

1. **Leave delegation enabled** unless you have a specific reason to disable it
2. **Use standard event names** (`onClick`, `onInput`) - they automatically delegate
3. **Avoid stopPropagation** unless necessary - it breaks delegation benefits
4. **Clean up properly**: Delegation cleans up automatically when islands are destroyed
