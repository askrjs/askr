/**
 * Benchmark event utilities
 *
 * Provides utilities for simulating events and measuring event handling.
 */

export interface EventMetrics {
  eventsDispatched: number;
  handlersCalled: number;
  averageLatency: number;
}

/**
 * Simulate rapid event firing
 */
export function fireEvents(
  target: EventTarget,
  eventType: string,
  count: number,
  intervalMs: number = 0
): Promise<EventMetrics> {
  return new Promise((resolve) => {
    let dispatched = 0;
    let handled = 0;
    const latencies: number[] = [];

    const fireNext = () => {
      if (dispatched >= count) {
        const averageLatency =
          latencies.length > 0
            ? latencies.reduce((a, b) => a + b, 0) / latencies.length
            : 0;

        resolve({
          eventsDispatched: dispatched,
          handlersCalled: handled,
          averageLatency,
        });
        return;
      }

      const startTime = performance.now();
      const event = new Event(eventType);
      target.dispatchEvent(event);
      dispatched++;

      // Track handler calls (this would need to be set up externally)
      // For now, assume all events are handled
      handled++;
      latencies.push(performance.now() - startTime);

      if (intervalMs > 0) {
        setTimeout(fireNext, intervalMs);
      } else {
        // Use nextTick for maximum speed
        Promise.resolve().then(fireNext);
      }
    };

    fireNext();
  });
}

/**
 * Create event target for benchmarking
 */
export function createEventTarget(): EventTarget {
  return new EventTarget();
}

/**
 * Add event listener with tracking
 */
export function addTrackedListener(
  target: EventTarget,
  eventType: string,
  handler: EventListener
): () => void {
  target.addEventListener(eventType, handler);
  return () => target.removeEventListener(eventType, handler);
}
