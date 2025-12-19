/**
 * Basic reusable test components
 * Import these to avoid repeating component definitions
 */

import { state } from '../../src/index';

/**
 * Simplest possible component - just renders static content
 */
export const Static = ({ text = 'Static' }: { text?: string }) => ({
  type: 'div',
  children: [text],
});

/**
 * Component with one state value - used for basic state tests
 */
export const SimpleCounter = () => {
  const count = state(0);
  return {
    type: 'div',
    children: [
      {
        type: 'button',
        props: { onClick: () => count.set(count() + 1) },
        children: [`Count: ${count()}`],
      },
    ],
  };
};

/**
 * Component that renders children - for composition tests
 */
export const Container = ({ children }: { children: unknown }) => ({
  type: 'div',
  props: { class: 'container' },
  children,
});

/**
 * Component with multiple state values - for hook order tests
 */
export const MultiState = () => {
  const count = state(0);
  const text = state('hello');
  const active = state(true);

  return {
    type: 'div',
    children: [
      { type: 'span', children: [`${count()}`] },
      { type: 'span', children: [text()] },
      { type: 'span', children: [String(active())] },
    ],
  };
};

/**
 * Component that throws when told to - for error tests
 */
export const MaybeThrows = ({ shouldThrow }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Intentional error');
  }
  return { type: 'div', children: ['OK'] };
};

/**
 * Nested component structure - for identity tests
 */
export const Nested = ({ depth = 3 }: { depth?: number }): unknown => {
  if (depth <= 0) {
    return { type: 'span', children: ['Leaf'] };
  }
  return {
    type: 'div',
    children: [Nested({ depth: depth - 1 })],
  };
};

export { SimpleList, KeyedList, ReorderableList } from './list_components';
export { SlowAsync, FailingAsync, CancelDetector } from './async_components';
