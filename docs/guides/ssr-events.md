# SSR and Event Handlers

This guide explains how event handlers work with Server-Side Rendering (SSR) in Askr.

## Key Principles

### 1. Event Handlers Are Client-Only

Event handlers are **not serialized** to HTML during SSR:

```tsx
// Component
function Button() {
  return <button onClick={() => console.log('Clicked')}>Click</button>;
}

// Server output
<button>Click</button>;
// No onclick attribute in HTML
```

This is **intentional** and follows web standards:

- **Security**: Prevents XSS attacks via malicious handler code
- **Performance**: Reduces HTML payload size
- **Standards**: JavaScript functions can't be serialized safely

### 2. Event Listeners Attach During Hydration

Listeners are attached when the client hydrates:

```tsx
// Server: Renders static HTML
const html = renderToStringSync(() => <Button />);
// Output: <button>Click</button>

// Client: Attaches event listener during hydration
import { createIsland } from '@askrjs/askr/boot';
await createIsland({ root: container, component: Button });
// Now the button is interactive
```

### 3. State Initializes Correctly

State values ARE rendered in SSR:

```tsx
function Counter() {
  const [count] = state(0);
  return <div>{count()}</div>;
}

// Server output
<div>0</div>;
// State value is preserved
```

During hydration, the state value is re-initialized and the DOM is preserved.

## Usage Patterns

### Basic Event Handler

```tsx
import { state } from '@askrjs/askr';

function ClickCounter() {
  const [count, setCount] = state(0);

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>Increment</button>
    </div>
  );
}
```

**Server output:**

```html
<div>
  <p>Count: 0</p>
  <button>Increment</button>
</div>
```

**After hydration:** Button becomes interactive, clicks increment the counter.

### Form Handling

```tsx
function LoginForm() {
  const [username, setUsername] = state('');
  const [password, setPassword] = state('');

  const handleSubmit = () => {
    console.log('Submit:', { username: username(), password: password() });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <input
        type="text"
        value={username()}
        onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
      />
      <input
        type="password"
        value={password()}
        onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

**Server output:**

```html
<form>
  <input type="text" value="" />
  <input type="password" value="" />
  <button type="submit">Login</button>
</form>
```

**After hydration:** Form becomes fully interactive with two-way binding.

### Progressive Enhancement

For critical forms, use native HTML form submission as fallback:

```tsx
function EnhancedForm() {
  return (
    <form action="/api/submit" method="POST">
      <input name="email" type="email" required />
      <button type="submit">Subscribe</button>
    </form>
  );
}
```

This works without JavaScript. After hydration, you can enhance with client-side validation:

```tsx
function EnhancedForm() {
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    // Client-side validation and AJAX submission
  };

  return (
    <form action="/api/submit" method="POST" onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <button type="submit">Subscribe</button>
    </form>
  );
}
```

## Hydration Workflow

### 1. Server Renders HTML

```typescript
import { renderToStringSync } from '@askrjs/askr/ssr';

const html = renderToStringSync(() => <App />);
// Outputs static HTML with state values, no event listeners
```

### 2. Client Receives HTML

Browser downloads and displays the HTML. The page is visible but **not interactive yet**.

### 3. JavaScript Loads

```html
<script type="module" src="/app.js"></script>
```

### 4. Hydration Runs

```typescript
import { createIsland } from '@askrjs/askr/boot';

await createIsland({
  root: document.getElementById('app')!,
  component: App,
});
```

During hydration:

1. **Match server HTML**: Verify client render matches server
2. **Attach listeners**: Add event handlers to elements
3. **Initialize state**: Re-create state variables
4. **Preserve DOM**: Reuse existing elements (no re-render)

### 5. Page Becomes Interactive

Users can now interact with buttons, forms, and other controls.

## Hydration Mismatches

### What Are Hydration Mismatches?

A hydration mismatch occurs when server HTML doesn't match client-rendered HTML:

```tsx
// NO Bad - causes mismatch
function BadComponent() {
  return <div>{Date.now()}</div>;
}
```

**Server output:** `<div>1709251200000</div>`  
**Client render:** `<div>1709251201000</div>`  
**Result:** Mismatch error, DOM replaced

### Common Causes

1. **Non-deterministic data**:

   ```tsx
   // NO Changes on each render
   <>
     <div>{Math.random()}</div>
     <div>{Date.now()}</div>
     <div>{Math.random() > 0.5 ? 'A' : 'B'}</div>
   </>
   ```

2. **Browser-only APIs**:

   ```tsx
   // NO window undefined on server
   <>
     <div>{window.innerWidth}</div>
     <div>{typeof window !== 'undefined' ? 'Browser' : 'Server'}</div>
   </>
   ```

3. **Conditional rendering based on environment**:
   ```tsx
   // NO Different output on server vs client
   {
     typeof window !== 'undefined' && <div>Client only</div>;
   }
   ```

### Solutions

1. **Use state for dynamic data**:

   ```tsx
   // OK Good - state initializes on mount
   function GoodComponent() {
     const [timestamp, setTimestamp] = state(Date.now());
     onMount(() => setTimestamp(Date.now()));
     return <div>{timestamp()}</div>;
   }
   ```

2. **Defer client-only content**:

   ```tsx
   // OK Good - waits for client
   function ClientOnly({ children }) {
     const [isMounted, setIsMounted] = state(false);
     onMount(() => setIsMounted(true));
     return isMounted() ? children : null;
   }
   ```

3. **Use refs for post-hydration updates**:

   ```tsx
   // OK Good - updates after hydration
   function ScreenWidth() {
     const [width, setWidth] = state(0);

     onMount(() => {
       setWidth(window.innerWidth);
     });

     return <div>Width: {width() || 'Calculating...'}</div>;
   }
   ```

## Event Handler Edge Cases

### Falsy Children

Askr correctly handles falsy children (`0`, `false`, `''`):

```tsx
function FalsyChildren() {
  const [count] = state(0);

  return (
    <div>
      <span>{count()}</span> {/* Renders "0" correctly */}
      <span>{false}</span> {/* Renders empty */}
      <span>{''}</span> {/* Renders empty */}
    </div>
  );
}
```

**Server output:**

```html
<div>
  <span>0</span>
  <span></span>
  <span></span>
</div>
```

### Event Handler Updates

Event handlers can update state immediately:

```tsx
function ImmediateUpdate() {
  const [value, setValue] = state('');

  return (
    <input
      value={value()}
      onInput={(e) => setValue((e.target as HTMLInputElement).value)}
    />
  );
}
```

State updates are batched and applied after the handler completes.

### Async Event Handlers

Async handlers work correctly:

```tsx
function AsyncHandler() {
  const [loading, setLoading] = state(false);

  const handleClick = async () => {
    setLoading(true);
    await fetch('/api/data');
    setLoading(false);
  };

  return (
    <button onClick={handleClick}>
      {loading() ? 'Loading...' : 'Fetch Data'}
    </button>
  );
}
```

## Performance Considerations

### SSR Payload Size

Event handlers don't increase SSR HTML size:

```tsx
// Component with many handlers
function ManyHandlers() {
  return (
    <div>
      <button onClick={() => console.log('1')}>Button 1</button>
      <button onClick={() => console.log('2')}>Button 2</button>
      <button onClick={() => console.log('3')}>Button 3</button>
      {/* ... 100 more buttons ... */}
    </div>
  );
}
```

**Server output:** No `onclick` attributes, minimal HTML size.

### Hydration Cost

Event listener attachment is fast:

- **100 listeners**: ~2-5ms
- **1000 listeners**: ~20-30ms

With **event delegation** enabled (default), the cost is even lower:

- **100 delegated listeners**: ~1-2ms
- **1000 delegated listeners**: ~5-10ms

## Best Practices

### 1. Keep Handlers Simple

```tsx
// OK Good - simple handler
const [count, setCount] = state(0);
const simple = <button onClick={() => setCount(count() + 1)}>+</button>;

// NO Bad - complex logic in JSX
const inlineComplex = (
  <button
    onClick={() => {
      if (count() < 10) {
        setCount(count() + 1);
      } else {
        alert('Max reached');
      }
    }}
  >
    +
  </button>
);

// OK Better - extract to function
const handleClick = () => {
  if (count() < 10) {
    setCount(count() + 1);
  } else {
    alert('Max reached');
  }
};
const extracted = <button onClick={handleClick}>+</button>;
```

### 2. Use Event Delegation

Leave delegation enabled (default) for better performance:

```tsx
// OK Automatically delegated
<button onClick={handleClick}>Click</button>
```

### 3. Progressive Enhancement

Design for non-JS users:

```tsx
// OK Works without JS, enhanced with JS
<form action="/submit" method="POST" onSubmit={handleSubmit}>
  <button type="submit">Submit</button>
</form>
```

### 4. Avoid Inline Functions for Stable Handlers

```tsx
// NO New function on each render
{
  items.map((item) => (
    <button key={item.id} onClick={() => handleClick(item.id)}>
      {item.name}
    </button>
  ));
}

// OK Stable handler reference
const handleClick = (id: string) => console.log(id);
{
  items.map((item) => (
    <button key={item.id} onClick={() => handleClick(item.id)}>
      {item.name}
    </button>
  ));
}
```

### 5. Test Hydration

Always test SSR + hydration:

```tsx
// Server test
const html = renderToStringSync(() => <Component />);
expect(html).toContain('expected content');

// Hydration test
import { createIsland } from '@askrjs/askr/boot';
container.innerHTML = html;
await createIsland({ root: container, component: Component });
expect(container.querySelector('button')).toBeDefined();
```

## Troubleshooting

### Buttons Not Clickable After Hydration

1. **Check hydration completed**: Look for errors in console
2. **Verify event delegation enabled**: `isEventDelegationEnabled()`
3. **Test handler definition**: Ensure handler is defined in scope

### State Not Updating on Click

1. **Check handler fires**: Add `console.log` inside handler
2. **Verify state is read**: Ensure `count()` called in JSX
3. **Flush scheduler**: Call `flushScheduler()` if in tests

### Hydration Mismatch Errors

1. **Check for non-deterministic code**: Remove `Date.now()`, `Math.random()`
2. **Use `onMount` for client-only code**
3. **Verify server and client use same data**

## Summary

- OK Event handlers are NOT serialized to HTML (security, performance)
- OK Listeners attach during hydration (page becomes interactive)
- OK State values ARE rendered in HTML (preserved during hydration)
- OK Event delegation enabled by default (better performance)
- OK Progressive enhancement recommended (works without JS)
- OK Test both SSR and hydration (catch mismatches early)
