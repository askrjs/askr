import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  archiveAccounts,
  getDashboardData,
  isAuthenticated,
  listAccounts,
  resetMockData,
  signIn,
  signOut,
} from '../src/lib/mock-data';

describe('lib mock data', () => {
  beforeEach(() => {
    resetMockData();
  });

  it('should return dashboard stats and activities', async () => {
    const result = await getDashboardData({
      signal: new AbortController().signal,
    });

    expect(result.stats.length).toBeGreaterThan(0);
    expect(result.activities.length).toBeGreaterThan(0);
  });

  it('should filter and paginate accounts', async () => {
    const result = await listAccounts({
      signal: new AbortController().signal,
      query: 'northwind',
      status: 'all',
      page: 1,
      pageSize: 5,
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.name.toLowerCase()).toContain('northwind');
    expect(result.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('should archive selected accounts', async () => {
    const before = await listAccounts({
      signal: new AbortController().signal,
      query: '',
      status: 'active',
      page: 1,
      pageSize: 20,
    });

    const ids = before.items.slice(0, 2).map((item) => item.id);
    const archiveResult = await archiveAccounts({
      ids,
      signal: new AbortController().signal,
    });

    expect(archiveResult.archived).toBe(2);

    const after = await listAccounts({
      signal: new AbortController().signal,
      query: '',
      status: 'archived',
      page: 1,
      pageSize: 20,
    });

    expect(after.items.some((item) => ids.includes(item.id))).toBe(true);
  });

  it('should sign in and sign out session state', async () => {
    expect(isAuthenticated()).toBe(false);

    await signIn({
      email: 'alex@example.com',
      password: 'askr1234',
      signal: new AbortController().signal,
    });

    expect(isAuthenticated()).toBe(true);

    signOut();
    expect(isAuthenticated()).toBe(false);
  });
});
