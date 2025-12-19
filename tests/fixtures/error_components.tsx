// tests/fixtures/error_components.tsx
import { state } from '../../src';

export function ThrowsInRender() {
  throw new Error('render error');
}

export function ThrowsInEvent() {
  const count = state(0);
  return (
    <button
      onClick={() => {
        throw new Error('event error');
      }}
    >
      Click me ({count()})
    </button>
  );
}

export function ThrowsInAsync() {
  const data = state(null);
  Promise.resolve().then(() => {
    throw new Error('async error');
  });
  return <div>{data()}</div>;
}

export function ConditionalState({ condition }: { condition: boolean }) {
  if (condition) {
    const count = state(0);
    return <div>{count()}</div>;
  }
  return <div>no state</div>;
}

export function StateInLoop() {
  const states = [];
  for (let i = 0; i < 3; i++) {
    const count = state(0);
    states.push(count());
  }
  return <div>{states.join(',')}</div>;
}
