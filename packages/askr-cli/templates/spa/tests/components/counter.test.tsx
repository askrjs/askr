import { describe, it, expect } from 'vitest';
import { state, derive } from '@askrjs/askr';

describe('Counter', () => {
  it('initializes state to zero', () => {
    const count = state(0);
    expect(count()).toBe(0);
  });

  it('increments state', () => {
    const count = state(0);
    count.set((c) => c + 1);
    expect(count()).toBe(1);
  });

  it('does not decrement below zero', () => {
    const count = state(0);
    count.set((c) => Math.max(0, c - 1));
    expect(count()).toBe(0);
  });

  it('derives parity from count', () => {
    const count = state(0);
    const parity = derive(() => (count() % 2 === 0 ? 'even' : 'odd'));

    expect(parity()).toBe('even');
    count.set(1);
    expect(parity()).toBe('odd');
    count.set(4);
    expect(parity()).toBe('even');
  });
});
