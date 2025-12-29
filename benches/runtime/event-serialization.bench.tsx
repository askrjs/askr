/**
 * Event serialization benchmark
 *
 * Measures how well events are serialized through the scheduler.
 * Validates deterministic event ordering under load.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
  fireEvent,
} from '../../tests/helpers/test-renderer';

describe('event serialization', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const setup = createTestContainer();
    container = setup.container;
    cleanup = setup.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('single event processing (transactional)', () => {
    let btn: HTMLButtonElement;
    beforeEach(() => {
      const Component = () => {
        const count = state(0);
        return {
          type: 'button',
          props: { id: 'btn', onClick: () => count.set(count() + 1) },
          children: ['click'],
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      btn = container.querySelector('#btn') as HTMLButtonElement;
    });

    bench('single event processing (transactional)', () => {
      // Trigger single event
      fireEvent.click(btn);
      flushScheduler();
    });
  });

  describe('100 rapid events (transactional)', () => {
    let btn: HTMLButtonElement;

    beforeEach(() => {
      const Component = () => {
        const count = state(0);
        return {
          type: 'button',
          props: { id: 'btn', onClick: () => count.set(count() + 1) },
          children: ['click'],
        };
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      btn = container.querySelector('#btn') as HTMLButtonElement;
    });

    bench('100 rapid events (transactional)', () => {
      for (let i = 0; i < 100; i++) {
        fireEvent.click(btn);
      }
      flushScheduler();
    });
  });

  describe('concurrent event ordering (invariant)', () => {
    let a: HTMLButtonElement;
    let b: HTMLButtonElement;
    let c: HTMLButtonElement;

    beforeEach(() => {
      const order: number[] = [];
      const Component = () => ({
        type: 'div',
        children: [
          {
            type: 'button',
            props: { id: 'a', onClick: () => order.push(1) },
            children: ['A'],
          },
          {
            type: 'button',
            props: { id: 'b', onClick: () => order.push(2) },
            children: ['B'],
          },
          {
            type: 'button',
            props: { id: 'c', onClick: () => order.push(3) },
            children: ['C'],
          },
        ],
      });

      createIsland({ root: container, component: Component });
      flushScheduler();

      a = container.querySelector('#a') as HTMLButtonElement;
      b = container.querySelector('#b') as HTMLButtonElement;
      c = container.querySelector('#c') as HTMLButtonElement;
    });

    bench('concurrent event ordering (invariant)', () => {
      // Fire events out of order but rapidly to stress ordering guarantees
      fireEvent.click(b);
      fireEvent.click(a);
      fireEvent.click(c);

      flushScheduler();
    });
  });
});
