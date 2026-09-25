/**
 * Boot and registration errors must point at entry points that exist:
 * `createSPA`/`hydrateSPA` for routed apps and `createIslands` for islands.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createIsland, createSPA } from '../../../src/boot';
import {
  _unlockRouteRegistrationForTests,
  lockRouteRegistration,
  route,
} from '../../../src/router/route';
import { resetRouteState } from '../../router-test-utils';

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

function resetExecutionModel(): void {
  delete (globalThis as Record<symbol, unknown>)[EXECUTION_MODEL_KEY];
}

function errorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the call to throw');
}

async function asyncErrorMessage(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the call to reject');
}

describe('boot guidance messages', () => {
  beforeEach(() => {
    resetRouteState();
    resetExecutionModel();
  });

  afterEach(() => {
    _unlockRouteRegistrationForTests();
    resetRouteState();
    resetExecutionModel();
    document.body.innerHTML = '';
  });

  it('should point createIsland with registered routes at createSPA/hydrateSPA', () => {
    route('/', () => null);
    const root = document.createElement('div');
    document.body.appendChild(root);

    const message = errorMessage(() =>
      createIsland({ root, component: () => null })
    );

    expect(message).toMatch(/Routes are not supported with islands/);
    expect(message).toMatch(/createSPA/);
    expect(message).toMatch(/hydrateSPA/);
    expect(message).not.toMatch(/createSSR/);
  });

  it('should point route() under islands at createSPA/hydrateSPA', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: () => null });

    const message = errorMessage(() => route('/late', () => null));

    expect(message).toMatch(/Routes are not supported with islands/);
    expect(message).toMatch(/hydrateSPA/);
    expect(message).not.toMatch(/createSSR/);
  });

  it('should name only existing entry points when registration is locked', () => {
    lockRouteRegistration();

    const message = errorMessage(() => route('/late', () => null));

    expect(message).toMatch(/locked after app startup/);
    expect(message).toMatch(/hydrateSPA/);
    expect(message).not.toMatch(/createSSR/);
  });

  it('should name only existing entry points when execution models are mixed', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    createIsland({ root, component: () => null });

    const message = await asyncErrorMessage(() =>
      createSPA({ root, registry: undefined as never })
    );

    expect(message).toMatch(/mixing execution models/);
    expect(message).toMatch(/createIslands/);
    expect(message).not.toMatch(/createSSR/);
  });
});
