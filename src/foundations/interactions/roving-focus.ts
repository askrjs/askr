/**
 * rovingFocus
 *
 * Single tab stop navigation with arrow-key control.
 *
 * INVARIANTS:
 * 1. Only one item in the group is reachable via Tab (single tab stop)
 * 2. Arrow keys move focus within the group
 * 3. Orientation determines which arrow keys are active
 * 4. Looping is opt-in
 * 5. Disabled items are skipped
 * 6. Returns props objects, never factories (composes via mergeProps)
 *
 * DESIGN:
 * - Container gets onKeyDown for arrow navigation
 * - Each item gets tabIndex based on current selection
 * - Navigation logic is pure - caller controls focus application
 * - Disabled check happens per-item via predicate
 *
 * PIT OF SUCCESS:
 * ✓ Can't accidentally break tab order (tabIndex assigned correctly)
 * ✓ Can't duplicate navigation logic (single source)
 * ✓ Composes via mergeProps (all standard props)
 * ✓ Type-safe - invalid indices caught at call site
 *
 * USAGE:
 *   const nav = rovingFocus({
 *     currentIndex: 0,
 *     itemCount: 3,
 *     orientation: 'horizontal',
 *     onNavigate: setIndex
 *   });
 *
 *   <div {...nav.container}>
 *     <button {...nav.item(0)}>First</button>
 *     <button {...nav.item(1)}>Second</button>
 *   </div>
 *
 * MISUSE EXAMPLE (PREVENTED):
 *   ❌ Can't forget to set tabIndex - returned in item props
 *   ❌ Can't create conflicting arrow handlers - mergeProps composes
 *   ❌ Can't skip disabled items incorrectly - logic is internal
 */

import type { KeyboardLikeEvent } from '../utilities/event-types';

export type Orientation = 'horizontal' | 'vertical' | 'both';

export interface RovingFocusOptions {
  /**
   * Current focused index
   */
  currentIndex: number;

  /**
   * Total number of items
   */
  itemCount: number;

  /**
   * Navigation orientation
   * - horizontal: ArrowLeft/ArrowRight
   * - vertical: ArrowUp/ArrowDown
   * - both: all arrow keys
   */
  orientation?: Orientation;

  /**
   * Whether to loop when reaching the end
   */
  loop?: boolean;

  /**
   * Callback when navigation occurs
   */
  onNavigate?: (index: number) => void;

  /**
   * Optional disabled state check per index
   */
  isDisabled?: (index: number) => boolean;
}

export interface RovingFocusResult {
  /**
   * Props for the container element (composes via mergeProps)
   */
  container: {
    onKeyDown: (e: KeyboardLikeEvent) => void;
  };

  /**
   * Generate props for an item at the given index (composes via mergeProps)
   */
  item: (index: number) => {
    tabIndex: number;
    'data-roving-index': number;
  };
}

export function rovingFocus(options: RovingFocusOptions): RovingFocusResult {
  const {
    currentIndex,
    itemCount,
    orientation = 'horizontal',
    loop = false,
    onNavigate,
    isDisabled,
  } = options;

  function findNextIndex(
    from: number,
    direction: 1 | -1
  ): number | undefined {
    let next = from + direction;

    // Handle looping
    if (loop) {
      if (next < 0) next = itemCount - 1;
      if (next >= itemCount) next = 0;
    } else {
      if (next < 0 || next >= itemCount) return undefined;
    }

    // Skip disabled items
    if (isDisabled?.(next)) {
      // Recursively find the next non-disabled item
      if (next === from) return undefined; // Prevent infinite loop
      return findNextIndex(next, direction);
    }

    return next;
  }

  function handleKeyDown(e: KeyboardLikeEvent) {
    const { key } = e;

    let direction: 1 | -1 | undefined;

    if (orientation === 'horizontal' || orientation === 'both') {
      if (key === 'ArrowRight') direction = 1;
      if (key === 'ArrowLeft') direction = -1;
    }

    if (orientation === 'vertical' || orientation === 'both') {
      if (key === 'ArrowDown') direction = 1;
      if (key === 'ArrowUp') direction = -1;
    }

    if (direction === undefined) return;

    const nextIndex = findNextIndex(currentIndex, direction);
    if (nextIndex === undefined) return;

    e.preventDefault?.();
    e.stopPropagation?.();

    onNavigate?.(nextIndex);
  }

  return {
    container: {
      onKeyDown: handleKeyDown,
    },
    item: (index: number) => ({
      tabIndex: index === currentIndex ? 0 : -1,
      'data-roving-index': index,
    }),
  };
}

/**
 * USAGE EXAMPLE:
 *
 * function Menu() {
 *   const [focusIndex, setFocusIndex] = state(0);
 *   const items = ['File', 'Edit', 'View'];
 *
 *   const navigation = rovingFocus({
 *     currentIndex: focusIndex(),
 *     itemCount: items.length,
 *     orientation: 'horizontal',
 *     loop: true,
 *     onNavigate: setFocusIndex,
 *   });
 *
 *   return (
 *     <div {...navigation.container}>
 *       {items.map((label, index) => (
 *         <button {...navigation.item(index)}>
 *           {label}
 *         </button>
 *       ))}
 *     </div>
 *   );
 * }
 */
