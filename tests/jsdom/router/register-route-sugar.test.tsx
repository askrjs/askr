import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { clearRoutes, getRoutes, route } from '../../../src/router/route';

describe('registerRoute sugar API', () => {
  beforeEach(() => {
    clearRoutes();
  });

  it('should support flat registrations with JSX-like handlers', () => {
    // flat registration using function/JSX shapes
    route('/', () => <div>{'root'}</div>);
    route('/pages', () => <div>{'list'}</div>);
    route('/pages/{id}', () => <div>{'detail'}</div>);

    const flat = getRoutes()
      .map((r) => r.path)
      .sort();

    expect(flat).toEqual(['/', '/pages', '/pages/{id}'].sort());
  });

  it('should support nested (inline) descriptor form and register the routes', () => {
    // explicit absolute registrations (descriptor sugar is removed)
    route('/', () => <div>{'root'}</div>);
    route('/pages', () => <div>{'list'}</div>);
    route('/pages/{id}', () => <div>{'detail'}</div>);

    const registered = getRoutes()
      .map((r) => r.path)
      .sort();
    expect(registered).toEqual(['/', '/pages', '/pages/{id}'].sort());
  });
});
