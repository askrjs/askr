import { bench, describe } from 'vitest';
import {
  composeRefs,
  setRef,
} from '../../src/foundations/utilities/compose-ref';

describe('composeRefs (FOUNDATIONS)', () => {
  // Mock refs
  const callbackRef1 = (_el: HTMLElement | null) => {};
  const callbackRef2 = (_el: HTMLElement | null) => {};
  const callbackRef3 = (_el: HTMLElement | null) => {};

  const objectRef1: { current: HTMLElement | null } = { current: null };
  const objectRef2: { current: HTMLElement | null } = { current: null };
  const objectRef3: { current: HTMLElement | null } = { current: null };

  const mockElement = { tagName: 'DIV' } as HTMLElement;

  bench('setRef with callback ref', () => {
    setRef(callbackRef1, mockElement);
  });

  bench('setRef with object ref', () => {
    setRef(objectRef1, mockElement);
  });

  bench('setRef with null ref (no-op)', () => {
    setRef(null, mockElement);
  });

  bench('setRef with undefined ref (no-op)', () => {
    setRef(undefined, mockElement);
  });

  bench('compose 2 callback refs', () => {
    const composed = composeRefs(callbackRef1, callbackRef2);
    composed(mockElement);
  });

  bench('compose 2 object refs', () => {
    const composed = composeRefs(objectRef1, objectRef2);
    composed(mockElement);
  });

  bench('compose 3 refs (mixed)', () => {
    const composed = composeRefs(callbackRef1, objectRef1, callbackRef2);
    composed(mockElement);
  });

  bench('compose 5 refs', () => {
    const composed = composeRefs(
      callbackRef1,
      objectRef1,
      callbackRef2,
      objectRef2,
      callbackRef3
    );
    composed(mockElement);
  });

  bench('compose 10 refs', () => {
    const composed = composeRefs(
      callbackRef1,
      objectRef1,
      callbackRef2,
      objectRef2,
      callbackRef3,
      objectRef3,
      callbackRef1,
      objectRef1,
      callbackRef2,
      objectRef2
    );
    composed(mockElement);
  });

  bench('compose with null refs', () => {
    const composed = composeRefs(callbackRef1, null, objectRef1, undefined);
    composed(mockElement);
  });

  bench('compose empty array', () => {
    const composed = composeRefs();
    composed(mockElement);
  });

  // Realistic scenarios
  bench('realistic: forward ref + internal ref', () => {
    const forwardedRef: { current: HTMLElement | null } = { current: null };
    const internalRef: { current: HTMLElement | null } = { current: null };
    const composed = composeRefs(forwardedRef, internalRef);
    composed(mockElement);
  });

  bench('realistic: multiple consumer refs', () => {
    const parentRef: { current: HTMLElement | null } = { current: null };
    const observerRef = (_node: HTMLElement | null) => {
      // Intersection observer logic
    };
    const resizeRef = (_node: HTMLElement | null) => {
      // Resize observer logic
    };
    const composed = composeRefs(parentRef, observerRef, resizeRef);
    composed(mockElement);
  });

  // Stress test: composition overhead
  bench('create composition (no execution)', () => {
    composeRefs(callbackRef1, objectRef1, callbackRef2);
  });

  bench('create and execute composition', () => {
    const composed = composeRefs(callbackRef1, objectRef1, callbackRef2);
    composed(mockElement);
  });

  // Cleanup scenario
  bench('cleanup: set refs to null', () => {
    const composed = composeRefs(callbackRef1, objectRef1, callbackRef2);
    composed(null);
  });

  // Error handling scenario (readonly ref)
  bench('setRef with readonly ref (catches error)', () => {
    const readonlyRef: { readonly current: HTMLElement | null } = Object.freeze(
      {
        current: null,
      }
    );
    setRef(readonlyRef, mockElement);
  });
});
