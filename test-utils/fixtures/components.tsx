/**
 * Basic reusable test components
 * Import these to avoid repeating component definitions
 */

import { state } from '../../src/boot';

/**
 * Simplest possible component - just renders static content
 */
export const Static = ({ text = 'Static' }: { text?: string }) => (
  <div>{text}</div>
);

/**
 * Component with one state value - used for basic state tests
 */
export const SimpleCounter = () => {
  const count = state(0);
  return (
    <div>
      <button
        onClick={() => count.set(count() + 1)}
      >{`Count: ${count()}`}</button>
    </div>
  );
};

/**
 * Component that renders children - for composition tests
 */
export const Container = ({ children }: { children: unknown }) => (
  <div class={'container'}>{children}</div>
);

/**
 * Component with multiple state values - for hook order tests
 */
export const MultiState = () => {
  const count = state(0);
  const text = state('hello');
  const active = state(true);

  return (
    <div>
      <span>{`${count()}`}</span>
      <span>{text()}</span>
      <span>{String(active())}</span>
    </div>
  );
};

/**
 * Component that throws when told to - for error tests
 */
export const MaybeThrows = ({ shouldThrow }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Intentional error');
  }
  return <div>{'OK'}</div>;
};

/**
 * Nested component structure - for identity tests
 */
export const Nested = ({ depth = 3 }: { depth?: number }): unknown => {
  if (depth <= 0) {
    return <span>{'Leaf'}</span>;
  }
  return <div>{Nested({ depth: depth - 1 })}</div>;
};

export { SimpleList, KeyedList, ReorderableList } from './list-components';
export { SlowAsync, FailingAsync, CancelDetector } from './async-components';
