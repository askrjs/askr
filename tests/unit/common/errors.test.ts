import { describe, expect, it, vi } from 'vite-plus/test';
import { catchError, handle, tryWithLogging } from '../../../src/common/errors';
import { SSRDataMissingError } from '../../../src/common/ssr-errors';
import { logger } from '../../../src/common/logger';

describe('common error utilities', () => {
  it('should return data from handle when a promise resolves', async () => {
    await expect(handle(Promise.resolve('ok'))).resolves.toEqual({
      data: 'ok',
      error: null,
    });
  });

  it('should return errors from handle when a promise rejects', async () => {
    const error = new Error('nope');

    await expect(handle(Promise.reject(error))).resolves.toEqual({
      data: null,
      error,
    });
  });

  it('should return fallback values from catchError when a promise rejects', async () => {
    await expect(
      catchError(Promise.reject(new Error('boom')), 'fallback')
    ).resolves.toBe('fallback');
  });

  it('should log and return null from tryWithLogging when an operation fails', async () => {
    const error = new Error('offline');
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(
      tryWithLogging(
        async () => {
          throw error;
        },
        { message: 'Fetch failed', retryable: true }
      )
    ).resolves.toBeNull();

    expect(spy).toHaveBeenCalledWith('Fetch failed', error);
    spy.mockRestore();
  });

  it('should preserve SSRDataMissingError identity and code', () => {
    const error = new SSRDataMissingError('missing data');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SSRDataMissingError);
    expect(error.name).toBe('SSRDataMissingError');
    expect(error.code).toBe('SSR_DATA_MISSING');
    expect(error.message).toBe('missing data');
  });
});
