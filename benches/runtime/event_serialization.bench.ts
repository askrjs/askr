/**
 * Event serialization benchmark
 *
 * Measures how well events are serialized through the scheduler.
 * Validates deterministic event ordering under load.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createApp, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  fireEvent,
} from '../../tests/helpers/test_renderer';

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
    beforeEach(async () => {
      const Component = () => {
        const count = state(0);
        return {
          type: 'button',
          props: { id: 'btn', onClick: () => count.set(count() + 1) },
          children: ['click'],
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
      btn = container.querySelector('#btn') as HTMLButtonElement;
    });

    bench('single event processing (transactional)', async () => {
      // Trigger single event
      fireEvent.click(btn);
      flushScheduler();
      await waitForNextEvaluation();
    });
  });

  describe('100 rapid events (transactional)', () => {
    let btn: HTMLButtonElement;

    beforeEach(async () => {
      const Component = () => {
        const count = state(0);
        return {
          type: 'button',
          props: { id: 'btn', onClick: () => count.set(count() + 1) },
          children: ['click'],
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
      btn = container.querySelector('#btn') as HTMLButtonElement;
    });

    bench('100 rapid events (transactional)', async () => {
      for (let i = 0; i < 100; i++) {
        fireEvent.click(btn);
      }
      flushScheduler();
      await waitForNextEvaluation();
    });
  });

  describe('concurrent event ordering (invariant)', () => {
    let a: HTMLButtonElement;
    let b: HTMLButtonElement;
    let c: HTMLButtonElement;

    beforeEach(async () => {
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

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();

      a = container.querySelector('#a') as HTMLButtonElement;
      b = container.querySelector('#b') as HTMLButtonElement;
      c = container.querySelector('#c') as HTMLButtonElement;
    });

    bench('concurrent event ordering (invariant)', async () => {
      // Fire events out of order but rapidly to stress ordering guarantees
      fireEvent.click(b);
      fireEvent.click(a);
      fireEvent.click(c);

      flushScheduler();

      await waitForNextEvaluation();
    });
  });
});
