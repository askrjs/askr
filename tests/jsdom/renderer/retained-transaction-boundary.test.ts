import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { runRetainedElementUpdate } from '../../../src/renderer/ownership/retained-element';
import {
  beginCommitTransaction,
  discardTransaction,
  getCurrentCommitTransaction,
  suspendTransaction,
} from '../../../src/runtime/transactions/access';

afterEach(() => {
  const transaction = getCurrentCommitTransaction();
  if (transaction) {
    discardTransaction(transaction);
    suspendTransaction(transaction);
  }
});

describe('retained element transaction boundary', () => {
  it('should release an owned transaction when snapshot preparation throws', () => {
    const element = document.createElement('input');
    const failure = new Error('snapshot failed');
    Object.defineProperty(element, 'value', {
      get: () => {
        throw failure;
      },
    });
    const update = vi.fn();
    const onError = vi.fn();
    expect(() =>
      runRetainedElementUpdate(element, vi.fn(), update, onError)
    ).toThrow(failure);
    expect(update).not.toHaveBeenCalled();
    expect(getCurrentCommitTransaction()).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('should roll back DOM changes even when error reporting throws', () => {
    const element = document.createElement('div');
    element.textContent = 'before';
    const reportFailure = new Error('report failed');
    expect(() =>
      runRetainedElementUpdate(
        element,
        vi.fn(),
        () => {
          element.textContent = 'after';
          throw new Error('update failed');
        },
        () => {
          throw reportFailure;
        }
      )
    ).toThrow(reportFailure);
    expect(element.textContent).toBe('before');
    expect(getCurrentCommitTransaction()).toBeNull();
  });

  it('should leave enclosing rollback authority with the caller after reporting fails', () => {
    const transaction = beginCommitTransaction();
    const element = document.createElement('div');
    element.textContent = 'before';
    expect(() =>
      runRetainedElementUpdate(
        element,
        vi.fn(),
        () => {
          element.textContent = 'after';
          throw new Error('update failed');
        },
        () => {
          throw new Error('report failed');
        }
      )
    ).toThrow('report failed');
    expect(getCurrentCommitTransaction()).toBe(transaction);
    expect(element.textContent).toBe('after');
    discardTransaction(transaction);
    expect(element.textContent).toBe('before');
  });
});
