import { expect, test, vi } from 'vitest';
import { ErrorBoundary } from '@askrjs/askr/components';
import { derive, state, type State } from '@askrjs/askr';
import '@askrjs/askr/boot';
import { watch } from '@askrjs/askr/resources';
import { render } from '@askrjs/askr/testing';

test('should preserve synchronous execution and committed watch generations', () => {
  const events: string[] = [];
  let count!: State<number>;
  const view = render(() => {
    events.push('render');
    count = state(0);
    const doubled = derive(() => count() * 2);
    watch(doubled, (value, { signal, previous, initial }) => {
      events.push(`watch:${value}:${previous}:${initial}`);
      signal.addEventListener('abort', () => events.push('abort'));
      return () => {
        events.push('cleanup');
      };
    });
    return <output>{() => doubled()}</output>;
  });
  try {
    expect(view.root.textContent).toBe('0');
    expect(events).toEqual(['render', 'watch:0:undefined:true']);
    count.set(1);
    count.set(2);
    view.flush();
    expect(view.root.textContent).toBe('4');
    expect(events).toEqual([
      'render',
      'watch:0:undefined:true',
      'abort',
      'cleanup',
      'watch:4:0:false',
    ]);
    view.unmount();
    view.unmount();
    expect(events.slice(-2)).toEqual(['abort', 'cleanup']);
    expect(events.filter((event) => event === 'cleanup')).toHaveLength(2);
    count.set(3);
    view.flush();
    expect(events.filter((event) => event.startsWith('watch:'))).toHaveLength(
      2
    );
  } finally {
    view.cleanup();
  }
});

test('should drain sibling cleanup before surfacing a strict disposal failure', () => {
  const events: string[] = [];
  const view = render(
    () => {
      const value = state(0);
      watch(value, () => () => {
        events.push('first');
        throw new Error('first cleanup failed');
      });
      watch(value, () => () => {
        events.push('second');
      });
      return <output>{value()}</output>;
    },
    { cleanupStrict: true }
  );
  try {
    expect(() => view.unmount()).toThrow(AggregateError);
    expect(events).toEqual(['second', 'first']);
    view.unmount();
    expect(events).toEqual(['second', 'first']);
  } finally {
    view.cleanup();
  }
});

test('should report a render failure before displaying its boundary fallback', () => {
  const errors: unknown[] = [];
  const failure = new Error('consumer render failed');
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const Broken = () => {
    throw failure;
  };
  const view = render(() => (
    <ErrorBoundary
      onError={(error) => {
        errors.push(error);
      }}
      fallback={(error) => {
        expect(errors).toEqual([failure]);
        expect(error).toBe(failure);
        return <p>recovered</p>;
      }}
    >
      <Broken />
    </ErrorBoundary>
  ));
  try {
    expect(view.root.textContent).toBe('recovered');
  } finally {
    view.cleanup();
    logged.mockRestore();
  }
});
