# Selective Hydration

Selective hydration defers hydration work for selected parts of server-rendered markup so critical UI becomes interactive first.

## Overview

Hydration makes server-rendered HTML interactive by attaching event listeners and initializing client-side state. With selective hydration, you can:

- **Defer whole-app hydration until idle**: Wait for idle time before attaching client interactivity
- **Defer below-fold subtrees**: Hydrate visible content first and activate marked below-fold subtrees later
- **Skip static sections**: Keep matched selectors as static HTML by leaving them unhydrated

## API

### Configuration

```typescript
import { hydrateSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/', () => null);
});

await hydrateSPA({
  root: document.getElementById('app')!,
  registry,
  hydrate: {
    // Defer below-fold content
    deferBelowFold: true,
    foldThreshold: window.innerHeight, // Default

    // Defer non-critical content until browser is idle
    deferUntilIdle: true,

    // Skip hydration for static selectors
    skipSelectors: ['.static-footer', '[data-static]', '#privacy-policy'],
  },
});
```

### Programmatic Control

Selective hydration is currently configured through `hydrateSPA({ hydrate: ... })`.
The lower-level hydration helpers live in internal runtime modules and are not a
supported public API.

## Strategies

### 1. Defer Below-the-Fold

Hydrate above-the-fold content immediately and leave below-fold subtrees inert until they are activated:

```typescript
hydrateSPA({
  root: document.getElementById('app'),
  registry,
  hydrate: {
    deferBelowFold: true,
    foldThreshold: window.innerHeight, // Customize fold line
  },
});
```

**Use case**: Long-scrolling pages, dashboards, article pages

Current behavior:

- Below-fold elements are marked with `data-skip-hydrate="true"` before hydration.
- Their event listeners and reactive props are not attached during the initial hydration pass.
- When the subtree becomes visible during scroll handling, Askr activates that boundary in place so its nodes become interactive.
- A discrete interaction inside a still-deferred boundary activates it immediately and replays the interaction after its listeners commit.

### 2. Defer Until Idle

Wait for browser idle time before hydrating the app:

```typescript
hydrateSPA({
  root: document.getElementById('app'),
  registry,
  hydrate: {
    deferUntilIdle: true,
  },
});
```

Uses `requestIdleCallback` internally when available and falls back to `setTimeout` otherwise.

**Use case**: Performance-critical landing pages, mobile web apps

Current behavior:

- If `deferUntilIdle` is used by itself, Askr delays the hydration pass until the idle callback fires.
- `skipSelectors` does not change that timing: permanent skips are marked before the same idle-delayed hydration pass.
- If it is combined with `deferBelowFold`, Askr hydrates the visible shell first and can activate deferred below-fold regions during the later idle pass.

### 3. Skip Static Content

Completely skip hydration for matched static sections:

```typescript
hydrateSPA({
  root: document.getElementById('app'),
  registry,
  hydrate: {
    skipSelectors: ['.footer', '.sidebar', '[data-static="true"]'],
  },
});
```

**Use case**: Static footers, legal pages, documentation sidebars

Current behavior:

- Matching selectors are marked with `data-skip-hydrate="true"`.
- Marked subtrees preserve their server HTML and do not receive event listeners or reactive prop wiring.
- This is intended for content that should remain static.

### 4. Combined Strategy

Combine multiple strategies for maximum optimization:

```typescript
hydrateSPA({
  root: document.getElementById('app'),
  registry,
  hydrate: {
    deferBelowFold: true,
    deferUntilIdle: true,
    foldThreshold: 800,
    skipSelectors: ['.footer', '.cookie-banner', '#analytics'],
  },
});
```

## How It Works

### Marking Elements

Elements are marked with `data-skip-hydrate="true"` attribute:

```html
<!-- Server-rendered HTML -->
<div class="content">
  <div class="hero">Interactive hero</div>
  <div class="footer" data-skip-hydrate="true">Static footer</div>
</div>
```

### Hydration Flow

1. **Initial hydration**: Unmarked content hydrates immediately.
2. **Deferred regions**: Marked subtrees keep their server HTML and remain inert.
3. **Activation**: Below-fold regions are activated by removing the marker and re-running hydration work for the root after scroll or idle deferral.
4. **Skipped content**: Static selectors remain marked and stay unhydrated.

### Event Listeners

Event listeners attached during deferred hydration work correctly:

```tsx
function DeferredButton() {
  return (
    <button onClick={() => console.log('Clicked after hydration')}>
      Click me
    </button>
  );
}
```

Discrete interactions activate deferred below-fold content and replay once.
Permanently skipped selectors stay static and are excluded from replay.

## Trade-offs

1. **Deferred work**: Below-fold content is activated by visibility, idle work, or its first discrete interaction
2. **Boundary activation**: Deferred regions hydrate in place without rerunning the root
3. **Complexity**: More configuration, harder to debug

## Best Practices

### 1. Prioritize Above-the-Fold

Always hydrate above-the-fold content immediately:

```typescript
const hydrate = {
  deferBelowFold: true,
  foldThreshold: window.innerHeight, // Ensure critical content hydrates
};
```

### 2. Skip Truly Static Content

Only skip content that never needs interactivity:

```typescript
skipSelectors: [
  '.static-footer', // OK Good - no interactions
  '.interactive-chart', // NO Bad - needs interactivity
];
```

### 3. Test on Real Devices

Performance gains vary by device. Test on:

- Low-end mobile devices
- Slow networks (3G)
- Throttled CPU

### 4. Monitor Activation Timing

Use performance monitoring to track TTI improvements:

```typescript
// Performance mark
performance.mark('hydration-start');

await hydrateSPA({
  root: document.getElementById('app')!,
  routes,
  hydrate: {
    deferUntilIdle: true,
  },
});

performance.mark('hydration-end');
performance.measure('hydration', 'hydration-start', 'hydration-end');

const [measure] = performance.getEntriesByName('hydration');
console.log(`Hydration took ${measure.duration}ms`);
```

### 5. Progressive Enhancement

Design components to work without JavaScript when possible:

```tsx
function Form() {
  return (
    <form action="/api/submit" method="POST">
      {/* Works without JS, enhanced after hydration */}
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Edge Cases

### Hydration Mismatch

Selective hydration can reveal hydration mismatches. Ensure server and client render identically:

```tsx
// NO Bad - causes mismatch
function Component() {
  return <div>{Date.now()}</div>;
}

// OK Good - deterministic
function Component() {
  const [timestamp] = state(Date.now());
  return <div>{timestamp()}</div>;
}
```

### Dynamic Fold Threshold

Adjust fold threshold dynamically:

```typescript
const foldThreshold =
  window.innerWidth < 768
    ? 600 // Mobile
    : 1200; // Desktop

hydrateSPA({
  hydrate: {
    deferBelowFold: true,
    foldThreshold,
  },
});
```

### Intersection Observer Polyfill

For older browsers, include a polyfill:

```html
<script src="https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserver"></script>
```

## Troubleshooting

### Content not hydrating

1. **Check console for errors**: Hydration errors are logged
2. **Verify selectors**: Ensure `skipSelectors` don't match interactive content
3. **Test scroll**: Below-fold content hydrates on scroll - scroll to trigger

### Poor performance

1. **Too aggressive deferral**: Don't defer interactive content users need immediately
2. **Large skip selectors**: Broad selectors (e.g., `div`) may skip too much
3. **Intersection Observer overhead**: For many elements, consider manual deferral

### Flickering

If content flickers during hydration:

1. **Match server output**: Ensure client renders identically to server
2. **Avoid conditional logic**: Don't use `location.href` or `navigator` during render
3. **Use CSS loading states**: Style non-hydrated content to prevent layout shift

## Examples

### Landing Page

```typescript
// Hero + CTA hydrate immediately
// Testimonials + footer defer
hydrateSPA({
  root: document.getElementById('app'),
  registry,
  hydrate: {
    deferBelowFold: true,
    foldThreshold: 900,
    skipSelectors: ['.footer', '.cookie-banner'],
  },
});
```

### Documentation Site

```typescript
// Main content immediate
// Sidebar navigation defers
hydrateSPA({
  root: document.getElementById('app'),
  registry,
  hydrate: {
    deferUntilIdle: true,
    skipSelectors: ['.sidebar-nav', '.table-of-contents'],
  },
});
```

### E-commerce Product Page

```typescript
// Product details + Add to Cart immediate
// Reviews + Related products defer
hydrateSPA({
  root: document.getElementById('app'),
  registry,
  hydrate: {
    deferBelowFold: true,
    foldThreshold: 800,
    skipSelectors: ['.footer'],
  },
});
```
