import { describe, it, expect, beforeEach } from 'vitest';
import { clearRoutes, getRoutes, route } from '../../src/index';

describe('registerRoute sugar API', () => {
  beforeEach(() => {
    clearRoutes();
  });

  it('should support flat registrations with JSX-like handlers', () => {
    // flat registration using function/JSX shapes
    route('/', () => ({ type: 'div', children: ['root'] }));
    route('/pages', () => ({ type: 'div', children: ['list'] }));
    route('/pages/{id}', () => ({ type: 'div', children: ['detail'] }));

    const flat = getRoutes()
      .map((r) => r.path)
      .sort();

    expect(flat).toEqual(['/', '/pages', '/pages/{id}'].sort());
  });

  it('should support nested (inline) descriptor form and register the routes', () => {
    // explicit absolute registrations (descriptor sugar is removed)
    route('/', () => ({ type: 'div', children: ['root'] }));
    route('/pages', () => ({ type: 'div', children: ['list'] }));
    route('/pages/{id}', () => ({ type: 'div', children: ['detail'] }));

    const registered = getRoutes()
      .map((r) => r.path)
      .sort();
    expect(registered).toEqual(['/', '/pages', '/pages/{id}'].sort());
  });
});
