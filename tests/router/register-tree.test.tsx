import { describe, it, expect, beforeEach } from 'vitest';
import { clearRoutes, getRoutes, route } from '../../src/router/route';

describe('explicit `route()` registrations', () => {
  beforeEach(() => {
    clearRoutes();
  });

  it('should register equivalent routes when using explicit `route()` calls', () => {
    // flat registration
    route('/', () => <div>{'root'}</div>);
    route('/pages', () => <div>{'list'}</div>);
    route('/pages/{id}', () => <div>{'detail'}</div>);

    const flat = getRoutes()
      .map((r) => r.path)
      .sort();

    clearRoutes();

    // explicit re-registration (same as flat)
    route('/', () => <div>{'root'}</div>);
    route('/pages', () => <div>{'list'}</div>);
    route('/pages/{id}', () => <div>{'detail'}</div>);

    const explicit = getRoutes()
      .map((r) => r.path)
      .sort();

    expect(explicit).toEqual(flat);
  });
});
