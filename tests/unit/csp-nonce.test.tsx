import { describe, expect, it } from 'vite-plus/test';
import { cspNonce } from '../../src';
import { renderToStringSync } from '../../src/ssr';

const NONCE = 'MDEyMzQ1Njc4OWFiY2RlZmdoaWpr';

describe('CSP nonce scope', () => {
  it('should expose a validated nonce during synchronous SSR', () => {
    const html = renderToStringSync(
      () => <span data-nonce={cspNonce()}>ok</span>,
      {},
      { cspNonce: NONCE }
    );
    expect(html).toContain(`data-nonce="${NONCE}"`);
  });

  it('should reject malformed and weak values without reflecting them', () => {
    for (const value of ['not base64', 'dG9vLXNob3J0']) {
      expect(() =>
        renderToStringSync(() => <span>never</span>, {}, { cspNonce: value })
      ).toThrow(
        'CSP nonce must be valid base64 or base64url encoding at least 16 bytes.'
      );
    }
  });

  it('should isolate separate render scopes', () => {
    const first = 'MDEyMzQ1Njc4OWFiY2RlZg';
    const second = 'ZmVkY2JhOTg3NjU0MzIxMA';
    expect(
      renderToStringSync(() => cspNonce() ?? '', {}, { cspNonce: first })
    ).toContain(first);
    expect(
      renderToStringSync(() => cspNonce() ?? '', {}, { cspNonce: second })
    ).toContain(second);
  });
});
