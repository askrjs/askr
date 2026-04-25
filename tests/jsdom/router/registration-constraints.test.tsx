import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  route,
  clearRoutes,
  resolveRoute,
  _unlockRouteRegistrationForTests,
  lockRouteRegistration,
} from '../../../src/router/route';
import { registerAppInstance } from '../../../src/router/navigate';

describe('route registration constraints', () => {
  beforeEach(() => {
    clearRoutes();
    try {
      _unlockRouteRegistrationForTests();
    } catch {
      // ignore
    }
  });

  it('should reject non-function components passed to route()', () => {
    expect(() =>
      route('/bad', {} as unknown as Parameters<typeof route>[1])
    ).toThrow(/requires a component function/i);
  });

  it('should reject paths that do not start with /', () => {
    expect(() => route('bad-path', () => null)).toThrow(/must begin with/i);
  });

  it('should reject Express-style :param syntax', () => {
    expect(() => route('/users/:id', () => null)).toThrow(
      /\{name\} interpolation/i
    );
  });

  it('should forbid registrations after app startup', () => {
    expect(() => route('/ok', () => null)).not.toThrow();

    registerAppInstance(
      {} as unknown as Parameters<typeof registerAppInstance>[0],
      '/'
    );

    lockRouteRegistration();

    expect(() => route('/after', () => null)).toThrow(
      /locked after app startup/i
    );
  });

  it('should choose the most specific match (longest-match-wins)', () => {
    route('/parent', () => 'A');
    route('/parent/{id}', () => 'B');

    const resolved = resolveRoute('/parent/xyz');
    expect(resolved).not.toBeNull();
    // The composed handler must render the more-specific route's output
    expect(resolved!.handler({})).toBe('B');
  });
});
