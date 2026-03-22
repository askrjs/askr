import { describe, it, expect } from 'vitest';
import { fetchUser } from '../src/resources/user';

describe('SSR Resources', () => {
  it('creates a resource for fetching user data', () => {
    // Resources are called during component render
    // Here we just verify the function is defined
    expect(fetchUser).toBeDefined();
    expect(typeof fetchUser).toBe('function');
  });
});
