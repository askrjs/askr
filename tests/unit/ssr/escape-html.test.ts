import { describe, expect, it } from 'vite-plus/test';
import { escapeHtml } from '@askrjs/askr/ssr';

describe('escapeHtml', () => {
  it('should escape text and quoted-attribute metacharacters', () => {
    expect(escapeHtml(`/a&b<c>"d"'e'`)).toBe(
      '/a&amp;b&lt;c&gt;&quot;d&quot;&#x27;e&#x27;'
    );
    expect(escapeHtml('plain')).toBe('plain');
  });

  it('should render missing values as empty and stringify others', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(false)).toBe('false');
    expect(escapeHtml({ toString: () => '<x>' })).toBe('&lt;x&gt;');
  });
});
