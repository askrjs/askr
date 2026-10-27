import { describe, expect, it, vi } from 'vite-plus/test';
import { createMutation } from '../../../src/data';

describe('overlapping mutations', () => {
  it('should keep earlier writes alive and let only the latest write publish visible state', async () => {
    const requests = new Map<
      string,
      { signal: AbortSignal; resolve: (value: string) => void }
    >();
    const mutation = createMutation({
      action: (input: string, { signal }) =>
        new Promise<string>((resolve) => {
          requests.set(input, { signal, resolve });
        }),
    });

    const first = mutation.execute('first');
    const second = mutation.execute('second');
    expect(requests.get('first')?.signal.aborted).toBe(false);
    expect(requests.get('second')?.signal.aborted).toBe(false);

    requests.get('first')?.resolve('first result');
    await expect(first).resolves.toBe('first result');
    expect(mutation.status).toBe('pending');

    requests.get('second')?.resolve('second result');
    await expect(second).resolves.toBe('second result');
    expect(mutation.status).toBe('success');
    expect(mutation.result).toBe('second result');
  });

  it('should abort every pending write when explicitly cancelled', async () => {
    const signals: AbortSignal[] = [];
    const mutation = createMutation({
      action: (_input: string, { signal }) =>
        new Promise<string>((_resolve, reject) => {
          signals.push(signal);
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    });

    const first = mutation.execute('first');
    const second = mutation.execute('second');
    mutation.abort();

    expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
    await expect(first).rejects.toBeDefined();
    await expect(second).rejects.toBeDefined();
    expect(mutation.status).toBe('idle');
  });

  it('should settle execute promptly when an action ignores its abort signal', async () => {
    let resolveAction!: (value: string) => void;
    const mutation = createMutation({
      action: () =>
        new Promise<string>((resolve) => {
          resolveAction = resolve;
        }),
    });
    const execution = mutation.execute('write');
    const observed = execution.then(
      () => 'resolved',
      (error: unknown) => error
    );

    mutation.abort();
    const outcome = await observed;
    resolveAction('late result');
    await execution.catch(() => undefined);

    expect(outcome).toMatchObject({ name: 'AbortError' });
    expect(mutation.status).toBe('idle');
    expect(mutation.result).toBeNull();
  });

  it('should invalidate affected queries when an aborted action later commits', async () => {
    let resolveAction!: (value: string) => void;
    const affects = vi.fn(() => ['posts']);
    const mutation = createMutation({
      action: () =>
        new Promise<string>((resolve) => {
          resolveAction = resolve;
        }),
      affects,
      afterSuccess: 'invalidate',
    });
    const execution = mutation.execute('write');

    mutation.abort();
    await expect(execution).rejects.toMatchObject({ name: 'AbortError' });
    resolveAction('committed');
    await Promise.resolve();
    await Promise.resolve();

    expect(affects).toHaveBeenCalledWith('write', 'committed');
  });

  it('should cancel an older pending write after the latest write has succeeded', async () => {
    let firstSignal!: AbortSignal;
    const mutation = createMutation({
      action: (input: string, { signal }) => {
        if (input === 'second') return Promise.resolve('saved');
        firstSignal = signal;
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });

    const first = mutation.execute('first');
    await expect(mutation.execute('second')).resolves.toBe('saved');
    expect(mutation.status).toBe('success');
    expect(firstSignal.aborted).toBe(false);

    mutation.abort();
    expect(firstSignal.aborted).toBe(true);
    await expect(first).rejects.toBeDefined();
    expect(mutation.status).toBe('success');
    expect(mutation.result).toBe('saved');
  });

  it('should apply an optimistic change before the write and roll it back on failure', async () => {
    let label = 'Ada';
    let rejectWrite!: (reason: Error) => void;
    const mutation = createMutation({
      optimistic: (next: string) => {
        const previous = label;
        label = next;
        return () => {
          label = previous;
        };
      },
      action: () =>
        new Promise<string>((_resolve, reject) => {
          rejectWrite = reject;
        }),
    });

    const write = mutation.execute('Grace');
    expect(label).toBe('Grace');
    rejectWrite(new Error('failed'));
    await expect(write).rejects.toThrow('failed');
    expect(label).toBe('Ada');
    expect(mutation.status).toBe('error');
  });

  it('should roll back each optimistic change once on explicit abort', async () => {
    const labels = new Map([
      ['first', 'old first'],
      ['second', 'old second'],
    ]);
    const rolledBack: string[] = [];
    const mutation = createMutation({
      optimistic: (key: string) => {
        const previous = labels.get(key)!;
        labels.set(key, `new ${key}`);
        return () => {
          rolledBack.push(key);
          labels.set(key, previous);
        };
      },
      action: (_key: string, { signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    });

    const first = mutation.execute('first');
    const second = mutation.execute('second');
    mutation.abort();
    await expect(first).rejects.toBeDefined();
    await expect(second).rejects.toBeDefined();
    expect(labels.get('first')).toBe('old first');
    expect(labels.get('second')).toBe('old second');
    expect(rolledBack).toEqual(['second', 'first']);
  });

  it('should restore the pre-mutation value when overlapping optimistic writes are aborted', async () => {
    let value = 'original';
    const mutation = createMutation({
      optimistic: (next: string) => {
        const previous = value;
        value = next;
        return () => {
          value = previous;
        };
      },
      action: (_input: string, { signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    });

    const first = mutation.execute('first');
    const second = mutation.execute('second');
    mutation.abort();
    await Promise.all(
      [first, second].map((request) => request.catch(() => {}))
    );

    expect(value).toBe('original');
  });

  it('should preserve a later optimistic write when an earlier write fails', async () => {
    let value = 'original';
    let rejectFirst!: (reason: Error) => void;
    const mutation = createMutation({
      optimistic: (next: string) => {
        const previous = value;
        value = next;
        return () => {
          value = previous;
        };
      },
      action: (input: string, { signal }) =>
        new Promise<string>((resolve, reject) => {
          if (input === 'first') rejectFirst = reject;
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
          if (input === 'second') {
            signal.addEventListener('abort', () => {}, { once: true });
          }
          void resolve;
        }),
    });

    const first = mutation.execute('first');
    const second = mutation.execute('second');
    rejectFirst(new Error('first failed'));
    await expect(first).rejects.toThrow('first failed');

    expect(value).toBe('second');
    mutation.abort();
    await expect(second).rejects.toBeDefined();
  });

  it('should not let an older failed write roll back a newer success', async () => {
    let value = 'original';
    let rejectFirst!: (reason: Error) => void;
    const mutation = createMutation({
      optimistic: (next: string) => {
        const previous = value;
        value = next;
        return () => {
          value = previous;
        };
      },
      action: (input: string) =>
        input === 'first'
          ? new Promise<string>((_resolve, reject) => {
              rejectFirst = reject;
            })
          : Promise.resolve(input),
    });

    const first = mutation.execute('first');
    await expect(mutation.execute('second')).resolves.toBe('second');
    rejectFirst(new Error('first failed'));
    await expect(first).rejects.toThrow('first failed');

    expect(value).toBe('second');
  });

  it('should retain an optimistic change after success', async () => {
    let label = 'Ada';
    let rollbacks = 0;
    const mutation = createMutation({
      optimistic: (next: string) => {
        label = next;
        return () => {
          rollbacks += 1;
          label = 'Ada';
        };
      },
      action: async (name: string) => name,
    });

    await expect(mutation.execute('Grace')).resolves.toBe('Grace');
    mutation.abort();
    expect(label).toBe('Grace');
    expect(rollbacks).toBe(0);
  });
});
