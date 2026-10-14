import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  beginRouteRequest,
  cancelRouteRequests,
  isStaleRouteRequest,
} from '../../../src/router/navigation-targets';

afterEach(() => cancelRouteRequests());

describe('navigation request ownership', () => {
  it('should retain the newer request started by a predecessor abort listener', () => {
    const first = beginRouteRequest();
    let nested!: ReturnType<typeof beginRouteRequest>;
    first.signal.addEventListener(
      'abort',
      () => {
        nested = beginRouteRequest();
      },
      { once: true }
    );
    const interrupted = beginRouteRequest();
    expect(interrupted.id).toBeLessThan(nested.id);
    expect(isStaleRouteRequest(interrupted.id)).toBe(true);
    expect(interrupted.signal.aborted).toBe(true);
    expect(isStaleRouteRequest(nested.id)).toBe(false);
    expect(nested.signal.aborted).toBe(false);
    beginRouteRequest();
    expect(nested.signal.aborted).toBe(true);
  });

  it('should retain a request started from a teardown abort listener', () => {
    const first = beginRouteRequest();
    let nested!: ReturnType<typeof beginRouteRequest>;
    first.signal.addEventListener(
      'abort',
      () => {
        nested = beginRouteRequest();
      },
      { once: true }
    );
    cancelRouteRequests();
    expect(isStaleRouteRequest(first.id)).toBe(true);
    expect(isStaleRouteRequest(nested.id)).toBe(false);
    expect(nested.signal.aborted).toBe(false);
    beginRouteRequest();
    expect(nested.signal.aborted).toBe(true);
  });

  it('should not revive a request canceled by its predecessor abort listener', () => {
    const first = beginRouteRequest();
    first.signal.addEventListener('abort', () => cancelRouteRequests(), {
      once: true,
    });
    const interrupted = beginRouteRequest();
    expect(interrupted.signal.aborted).toBe(true);
    expect(isStaleRouteRequest(interrupted.id)).toBe(true);
  });

  it('should abort each superseded request once and make repeated cancellation harmless', () => {
    let aborted = 0;
    const first = beginRouteRequest();
    first.signal.addEventListener('abort', () => {
      aborted++;
    });
    const second = beginRouteRequest();
    second.signal.addEventListener('abort', () => {
      aborted++;
    });
    cancelRouteRequests();
    cancelRouteRequests();
    expect(aborted).toBe(2);
    expect(isStaleRouteRequest(first.id)).toBe(true);
    expect(isStaleRouteRequest(second.id)).toBe(true);
  });
});
