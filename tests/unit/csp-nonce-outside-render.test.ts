import { describe, expect, it, vi } from 'vite-plus/test';

// Reword readScope()'s out-of-render error. cspNonce() must decide from scope
// state, not from the wording of that message.
vi.mock('../../src/runtime/context/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/runtime/context/context')>();
  return {
    ...actual,
    readScope: vi.fn((scope: Parameters<typeof actual.readScope>[0]) => {
      try {
        return actual.readScope(scope);
      } catch {
        throw new Error('No active scope frame.');
      }
    }),
  };
});

const { cspNonce } = await import('../../src');
const { renderToStringSync } = await import('../../src/ssr');

const NONCE = 'MDEyMzQ1Njc4OWFiY2RlZmdoaWpr';

describe('cspNonce() outside a render', () => {
  it('should return undefined regardless of readScope() error wording', () => {
    expect(cspNonce()).toBeUndefined();
  });

  it('should still read the nonce inside a render', () => {
    expect(
      renderToStringSync(() => cspNonce() ?? '', {}, { cspNonce: NONCE })
    ).toContain(NONCE);
  });
});
