# State Management

## Creating State

```typescript
const [value, setValue] = state(initialValue);
```

You can also destructure directly to a getter/setter tuple (feels familiar to many frameworks):

```typescript
const [count, setCount] = state(0);
count(); // getter: read
setCount(1); // setter: write (same as count.set)
```

Returns a tuple `[getter, setter]`:

- `getter()` - call to read the current value
- `setter` - call to update the value (accepts a value or updater function)

## Reading State

Call the getter function:

```typescript
const [count, setCount] = state(0);
console.log(count()); // 0
```

## Writing State

Call the setter with a value:

```typescript
setCount(1);
```

Or with an updater function:

```typescript
setCount((prev) => prev + 1);
```

## Derived State

```typescript
const [count, setCount] = state(0);
const doubled = derive(() => count() * 2);

return <div>{count()} doubled is {doubled}</div>;
```

`derive()` returns the derived value for the current render. When upstream state changes and the component re-renders, the derived value is recomputed.

You can also use the two-argument form when you want to separate the source read from the projection:

```typescript
const [user, setUser] = state({ name: 'Jeff', age: 42 });
const isAdult = derive(() => user(), (currentUser) => currentUser.age >= 18);

return <div>{isAdult ? 'adult' : 'minor'}</div>;
```

## Rules

1. **Call state() at top level** - Not inside conditionals or loops
2. **Call in same order every render** - Hook order must be stable
3. **Don't mutate during render** - Only in event handlers

These rules are enforced at runtime with clear error messages.
