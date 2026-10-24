# Event Delegation

Event delegation is an optimization that reduces memory usage and improves performance by attaching a single event listener per event type at each app's root container (the `root` passed to `createIsland`, `createSPA` or `hydrateSPA`) instead of individual listeners on each element.

## How It Works

Askr delegates supported DOM events automatically. There is no app-level setup
for the common case.

These event types are delegated:

- **Mouse events**: `click`, `dblclick` (`onDblClick`, or `onDoubleClick` as
  an alias), `mousedown`, `mouseup`, `mouseover`,
  `mouseout`, `mousemove`
- **Pointer events**: `pointerdown`, `pointerup`, `pointermove`,
  `pointercancel`, `pointerover`, `pointerout`
- **Touch events**: `touchend`, `touchcancel`
- **Keyboard events**: `keydown`, `keyup`, `keypress`
- **Form events**: `input`
- **Focus events**: `focusin`, `focusout`

`onFocus` and `onBlur` also observe their descendants, as in React: besides a
direct listener for the element's own `focus`/`blur`, an element with either
prop gets a delegated `focusin`/`focusout` handler that runs for focus changes
inside it (the handler then receives the `focusin`/`focusout` event). An
element's own focus runs the handler once.

Every other event attaches a listener directly to its element, including:

- **Non-composed events** such as `change` and `submit`. They never leave a
  shadow root, so a delegated listener at the app root could not see them for
  a form control or form inside one. They stay direct listeners.
- **Non-bubbling events** such as `scroll`, `mouseenter`, `mouseleave`,
  `pointerenter`, `pointerleave` and `load`. A handler only runs for its own
  element, as with `addEventListener`: `onScroll` on a wrapper does not run
  when a scrollable descendant scrolls.
- **`wheel`, `touchstart` and `touchmove`**, registered with
  `{ passive: false }` so `preventDefault()` in `onWheel`, `onTouchStart` or
  `onTouchMove` cancels scrolling and zooming. Browsers treat these listeners
  as passive by default on document-level targets. Only elements that have
  such a handler pay the cost of a non-passive listener.
- **Handlers with listener options** (`Capture`, `Passive`, `Once`; see below)
  and other event types not listed above.

### The event object

Every delegated handler for one event receives the same event object, the
native event itself. While handlers run, `event.currentTarget` is the element
whose handler is running (and `event.target` is the real target inside a
shadow tree); after dispatch it is `null`, as for a native listener. The event
also has a `nativeEvent` property (the event itself), so code written for
wrappers that expose one keeps working. Because the object is the native event,
a handler can keep it and dispatch it again on another target, including
outside its original app root, once the current
dispatch has finished.

An event inside an app root is handled once at that root. `document.body` also
listens, for content rendered outside any root (portals), and skips an event
a root already handled.

### Listener options

A prop name can end in `Capture`, `Passive` or `Once`, alone or combined in
that order, to set the listener options for that handler:

```tsx
<div onWheelPassive={track} onClickOnce={intro} onScrollCapturePassive={log} />
```

- `Capture` listens in the capture phase.
- `Passive` registers a passive listener, so the browser can scroll without
  waiting for the handler. `preventDefault()` has no effect in it.
- `Once` runs the handler for the first event only and then stops listening.

Each of these attaches a direct listener to the element, since one delegated
listener cannot carry per-handler options.

Delegated handlers run target-first, in the same order as native bubbling.
Server-rendered markup that is hydrated uses the same model as client-rendered
nodes, so propagation and `stopPropagation()` behave identically whether a
node was hydrated or created on the client.

Because each app listens at its own root, apps mounted inside a shadow root or
an iframe receive their events, and an app mounted inside another app's tree
handles its own events before they bubble to the outer app.

### Shadow DOM

Delegation follows the event's `composedPath()` up to the app root, so
handlers on app nodes inside an **open** shadow root attached within the app's
tree (including light children slotted into one) run once, in native bubbling
order, and `stopPropagation()` inside the shadow tree stops the app's outer
handlers. As with native listeners, `event.target` is the real target for a
handler inside the shadow tree and is retargeted to the shadow host for
handlers outside it.

Limits:

- Nodes inside a **closed** shadow root are hidden from listeners outside it:
  the app root sees the event retargeted to the shadow host, so delegated
  handlers (`onClick`, `onInput`, `onKeyDown`, ...) inside the closed tree do
  not run, while the host and its ancestors still do. `onChange`, `onSubmit`
  and other directly attached handlers do run.
- A delegated event type dispatched with `composed: false` from inside a
  shadow root (for example `new MouseEvent('click', { bubbles: true })`) never
  reaches the app root, so delegated handlers inside the shadow tree do not
  run. Native `click`, `input`, keyboard, mouse and touch events are composed.

For full support inside a closed shadow root, mount an app on an element
inside it, so that app listens at its own root.

## Usage

### Basic Example

```tsx
import { state } from '@askrjs/askr';
import { createIsland } from '@askrjs/askr/boot';

function Counter() {
  const [count, setCount] = state(0);

  return (
    <div>
      <button onClick={() => setCount(count() + 1)}>Count: {count()}</button>
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
  const [count1, setCount1] = state(0);
  const [count2, setCount2] = state(0);

  return (
    <button
      onClick={() => {
        setCount1(count1() + 1);
        setCount2(count2() + 1);
        // Both updates batched - single re-render
      }}
    >
      Update Both
    </button>
  );
}
```

### Handler Errors

An exception thrown by an event handler is reported with the platform
`reportError()`, the same path an uncaught error in a native listener takes. It
dispatches a `window` `error` event, so global error handlers and monitoring see
it, in development and production builds. Other handlers for the same event
still run, just as they would for native listeners. An `ErrorBoundary` does not
catch handler errors; it only covers rendering.

Hosts without `reportError()`, including Node and jsdom, rethrow the error from
a microtask instead. In Node it arrives as an `uncaughtException`, and test
runners that fail on unhandled errors report it. Stub `globalThis.reportError`
in tests that throw from handlers on purpose.

## Performance Characteristics

### Benefits

1. **Memory efficiency**: One delegated listener instead of N individual listeners
2. **Dynamic content**: New elements automatically inherit delegation without setup
3. **Cleanup**: Simpler memory management

### Overhead

- **Event bubbling**: Small cost for events to bubble to the app root
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
  const btnRef = { current: null as HTMLButtonElement | null };
  const handler = () => {
    console.log('Custom event fired');
  };

  onMount(() => {
    const button = btnRef.current;
    if (!button) {
      return;
    }

    button.addEventListener('customEvent', handler);
    return () => button.removeEventListener('customEvent', handler);
  });

  return <button ref={btnRef}>Custom</button>;
}
```

### Capture Phase

Delegated events use the bubble phase. Capture-suffixed JSX props such as
`onPointerDownCapture` attach direct capture listeners instead of delegated
ones. Those listeners only observe events that pass through the element's own
capture path, so outside-click helpers need to mount them on a wrapper or
overlay surface rather than the dismissed node itself:

```tsx
<div onPointerDownCapture={handler}>...</div>
```

For custom events or imperative listeners outside JSX, attach directly:

```tsx
onMount(() => {
  element.addEventListener('click', handler, { capture: true });
});
```

## Troubleshooting

### Event not firing

1. **Verify event type is delegated**: See list above
2. **Check stopPropagation**: Earlier handlers might prevent bubbling
3. **A `Capture`, `Passive` or `Once` suffix** attaches a direct listener to the element

### Performance issues

1. **Too many handlers**: Consider using a single handler with logic
2. **Excessive bubbling**: Reduce unnecessary nesting around hot interactive regions

## Best Practices

1. **Use standard event names** (`onClick`, `onInput`) so the runtime can delegate them automatically
2. **Avoid stopPropagation** unless necessary because it cuts off delegated bubbling
3. **Clean up properly**: Delegation cleans up automatically when islands are destroyed
