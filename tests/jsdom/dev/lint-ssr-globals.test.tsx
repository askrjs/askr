import { describe, expect, test } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import type { JSXElement } from '../../../src/jsx/types';

describe('SSR strict-purity guard', () => {
  test('should throw when Math.random is used during sync SSR', () => {
    const Random = () => (<div>{Math.random()}</div>) as unknown as JSXElement;

    expect(() => renderToStringSync(Random)).toThrow(/Math\.random.*SSR/i);
  });

  test('should throw when Date.now is used during sync SSR', () => {
    const Timestamp = () => {
      const now = Date.now();
      return (<div>{String(now)}</div>) as unknown as JSXElement;
    };

    expect(() => renderToStringSync(Timestamp)).toThrow(/Date\.now.*SSR/i);
  });

  test('should allow ordinary SSR rendering', () => {
    const Plain = () => (<div>ok</div>) as unknown as JSXElement;

    expect(renderToStringSync(Plain)).toContain('ok');
  });
});
