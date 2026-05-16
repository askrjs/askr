# Event Delegation

Event delegation is an optimization that reduces memory usage and improves performance by attaching a single event listener at a container level (by default `document.body`) instead of individual listeners on each element.

## How It Works

Askr delegates supported DOM events automatically. There is no app-level setup
for the common case.

These event types are delegated:

- **Mouse events**: `click`, `dblclick`, `mousedown`, `mouseup`, `mousemove`
- **Pointer events**: `pointerdown`, `pointerup`, `pointermove`, `pointercancel`
- **Touch events**: `touchstart`, `touchend`, `touchmove`, `touchcancel`
- **Keyboard events**: `keydown`, `keyup`, `keypress`
- **Focus events**: `focusin`, `focusout`
- **Form events**: `input`, `change`, `submit`, `reset`

Non-delegated events (e.g., `scroll`, `load`) attach listeners directly to elements.

## Usage

### Basic Example

```tsx
import { state } from '@askrjs/askr';
import { createIsland } from '@askrjs/askr/boot';

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

The `onClick` handler is delegated automatically. No extra framework setup is
required.

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
    return () => btnRef.current".removeEventListener('customEvent', handler);
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

1. **Verify event type is delegated**: See list above
2. **Check stopPropagation**: Earlier handlers might prevent bubbling

### Performance issues

1. **Too many handlers**: Consider using a single handler with logic
2. **Excessive bubbling**: Reduce unnecessary nesting around hot interactive regions

## Best Practices

1. **Use standard event names** (`onClick`, `onInput`) so the runtime can delegate them automatically
2. **Avoid stopPropagation** unless necessary because it cuts off delegated bubbling
3. **Clean up properly**: Delegation cleans up automatically when islands are destroyed
