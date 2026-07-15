import { describe, expect, it } from 'vite-plus/test';
import {
  defer,
  isDeferred,
  resolveDeferredValues,
} from '../../../src/router/deferred';

describe('deferred route data', () => {
  it('should resolve every nested deferred value', async () => {
    const first = defer(Promise.resolve('ready'));
    const second = defer(Promise.resolve(2));
    const data = { first, nested: [{ second }] };

    await expect(resolveDeferredValues(data)).resolves.toBe(data);
    expect(isDeferred(first)).toBe(true);
    expect(first.state).toBe('fulfilled');
    expect(first.value).toBe('ready');
    expect(second.state).toBe('fulfilled');
    expect(second.value).toBe(2);
  });

  it('should reject unresolved work given an abort signal', async () => {
    const controller = new AbortController();
    const pending = defer(new Promise<string>(() => undefined));
    const result = resolveDeferredValues({ pending }, controller.signal);

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});
