import { describe, it, expect, beforeEach } from 'vitest';
import {
  route,
  registerRoute,
  clearRoutes,
  resolveRoute,
  _unlockRouteRegistrationForTests,
  lockRouteRegistration,
} from '../../src/router/route';
import { registerAppInstance } from '../../src/router/navigate';

describe('route registration constraints', () => {
  beforeEach(() => {
    clearRoutes();
    // Ensure registration is allowed before each test (unlock test helper)
    try {
      _unlockRouteRegistrationForTests();
    } catch {
      // ignore
    }
  });

  it('should reject non-function handlers passed to route()', () => {
    expect(() => route('/bad', {} as any)).toThrow(
      /requires a function handler/i
    );
  });

  it('should reject non-function handlers passed to registerRoute descriptors', () => {
    expect(() => registerRoute('/a', {} as any)).toThrow(
      /requires a function handler/i
    );
  });

  it('should forbid registrations after app startup', () => {
    // pre-start registrations succeed
    expect(() => route('/ok', () => null)).not.toThrow();

    // simulate app startup
    registerAppInstance({} as any, '/');

    // In test env registration lock is not automatically applied; simulate production lock
    // by calling the public lock helper (production behavior: registrations are forbidden after startup)
    lockRouteRegistration();

    expect(() => route('/after', () => null)).toThrow(/locked after app startup/i);
  });

  it('should choose the most specific match (longest-match-wins)', () => {
    function a() {
      return 'A';
    }
    function b() {
      return 'B';
    }

    route('/parent', a);
    route('/parent/{id}', b);

    const resolved = resolveRoute('/parent/xyz');
    expect(resolved).not.toBeNull();
    expect(resolved!.handler).toBe(b);
  });
});