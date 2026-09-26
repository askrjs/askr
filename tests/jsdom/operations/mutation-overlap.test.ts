import { describe, expect, it } from 'vite-plus/test';
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
});
