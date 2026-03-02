# Selective Hydration

Selective hydration optimizes Time-to-Interactive (TTI) by deferring hydration of non-critical parts of your application.

## Overview

Hydration makes server-rendered HTML interactive by attaching event listeners and initializing client-side state. With selective hydration, you can:

- **Defer idle content**: Hydrate below-the-fold content after initial viewport is interactive
- **Defer until idle**: Wait for browser idle time before hydrating non-critical components
- **Skip static sections**: Completely skip hydration for static content

## API

### Configuration

```typescript
import { hydrateSPA } from '@askrjs/askr';

await hydrateSPA({
  root: document.getElementById('app'),
  routes: [...],
  hydrate: {
    // Defer below-fold content
    deferBelowFold: true,
    foldThreshold: window.innerHeight, // Default

    // Defer non-critical content until browser is idle
    deferUntilIdle: true,

    // Skip hydration for static selectors
    skipSelectors: [
      '.static-footer',
      '[data-static]',
      '#privacy-policy'
    ]
  }
});
```

### Programmatic Control

```typescript
import {
  setSelectiveHydrationOptions,
  shouldSkipHydrationOnElement,
  isElementAboveFold,
} from '@askrjs/askr/runtime/hydration';

// Set options at runtime
setSelectiveHydrationOptions({
  deferBelowFold: true,
  foldThreshold: 800,
});

// Check if element should be skipped
const element = document.querySelector('.content');
if (shouldSkipHydrationOnElement(element!)) {
  console.log('Skipping hydration for this element');
}

// Check if element is visible
if (isElementAboveFold(element!, 600)) {
  console.log('Element is above fold');
}
```

## Strategies

### 1. Defer Below-the-Fold

Hydrate above-the-fold content immediately, defer the rest:

```typescript
hydrateSPA({
  root: document.getElementById('app'),
  routes: routes,
  hydrate: {
    deferBelowFold: true,
    foldThreshold: window.innerHeight, // Customize fold line
  },
});
```

**Use case**: Long-scrolling pages, dashboards, article pages

**TTI improvement**: 30-50% for content-heavy pages

### 2. Defer Until Idle

Wait for browser idle time before hydrating:

```typescript
hydrateSPA({
  root: document.getElementById('app'),
  routes: routes,
  hydrate: {
    deferUntilIdle: true,
  },
});
```

Uses `requestIdleCallback` internally. Falls back to `setTimeout` in unsupported browsers.

**Use case**: Performance-critical landing pages, mobile web apps

**TTI improvement**: 20-40% when main thread is busy

### 3. Skip Static Content

Completely skip hydration for static sections:

```typescript
hydrateSPA({
  root: document.getElementById('app'),
  routes: routes,
  hydrate: {
    skipSelectors: ['.footer', '.sidebar', '[data-static="true"]'],
  },
});
```

**Use case**: Static footers, legal pages, documentation sidebars

**Memory savings**: ~10-30KB per skipped section (varies by complexity)

### 4. Combined Strategy

Combine multiple strategies for maximum optimization:

```typescript
hydrateSPA({
  root: document.getElementById('app'),
  routes: routes,
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

1. **Initial hydration**: Above-the-fold, critical components hydrate immediately
2. **Deferred hydration**: Below-the-fold content hydrates when:
   - Element scrolls into view (intersection observer)
   - Browser is idle (requestIdleCallback)
3. **Skipped content**: Never hydrates, remains static HTML

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

Clicks before hydration are ignored. After hydration, the button becomes interactive.

## Performance Characteristics

### Metrics

- **TTI (Time to Interactive)**: 20-50% improvement with aggressive deferral
- **FCP (First Contentful Paint)**: Unchanged (content already rendered by SSR)
- **Memory**: 5-20% reduction by skipping static sections

### Trade-offs

1. **Delayed interactivity**: Below-fold content isn't interactive until hydrated
2. **Complexity**: More configuration, harder to debug
3. **Browser compatibility**: Intersection Observer required for below-fold detection

## Best Practices

### 1. Prioritize Above-the-Fold

Always hydrate above-the-fold content immediately:

```typescript
hydrate: {
  deferBelowFold: true,
  foldThreshold: window.innerHeight // Ensure critical content hydrates
}
```

### 2. Skip Truly Static Content

Only skip content that never needs interactivity:

```typescript
skipSelectors: [
  '.static-footer', // ✅ Good - no interactions
  '.interactive-chart', // ❌ Bad - needs interactivity
];
```

### 3. Test on Real Devices

Performance gains vary by device. Test on:

- Low-end mobile devices
- Slow networks (3G)
- Throttled CPU

### 4. Monitor TTI

Use performance monitoring to track TTI improvements:

```typescript
// Performance mark
performance.mark('hydration-start');

await hydrateSPA({...});

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
// ❌ Bad - causes mismatch
function Component() {
  return <div>{Date.now()}</div>;
}

// ✅ Good - deterministic
function Component() {
  const timestamp = state(Date.now());
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
  routes: routes,
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
  routes: routes,
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
  routes: routes,
  hydrate: {
    deferBelowFold: true,
    fold Threshold: 800,
    skipSelectors: ['.footer']
  }
});
```
