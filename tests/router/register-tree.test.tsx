import { describe, it, expect, beforeEach } from 'vitest';
import { clearRoutes, getRoutes, route } from '../../src/router/route';

describe('explicit `route()` registrations', () => {
  beforeEach(() => {
    clearRoutes();
  });

  it('should register equivalent routes when using explicit `route()` calls', () => {
    // flat registration
    route('/', () => ({ type: 'div', children: ['root'] }));
    route('/pages', () => ({ type: 'div', children: ['list'] }));
    route('/pages/{id}', () => ({ type: 'div', children: ['detail'] }));

    const flat = getRoutes()
      .map((r) => r.path)
      .sort();

    clearRoutes();

    // explicit re-registration (same as flat)
    route('/', () => ({ type: 'div', children: ['root'] }));
    route('/pages', () => ({ type: 'div', children: ['list'] }));
    route('/pages/{id}', () => ({ type: 'div', children: ['detail'] }));

    const explicit = getRoutes()
      .map((r) => r.path)
      .sort();

    expect(explicit).toEqual(flat);
  });
});
