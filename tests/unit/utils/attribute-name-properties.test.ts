import { describe, expect, it } from 'vite-plus/test';
import {
  attributeNamespace,
  getPublicAttributeName,
} from '../../../src/common/attr-names';

describe('attribute names matching object properties', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'should preserve the ordinary attribute name %s',
    (name) => {
      expect(getPublicAttributeName(name)).toBe(name);
      expect(getPublicAttributeName(name, true)).toBe(name);
    }
  );
  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'should leave unrecognized namespace prefix %s unnamespaced',
    (prefix) => {
      expect(
        attributeNamespace('http://www.w3.org/2000/svg', `${prefix}:value`)
      ).toBeNull();
    }
  );
  it('should retain declared aliases and namespaces', () => {
    expect(getPublicAttributeName('className')).toBe('class');
    expect(getPublicAttributeName('strokeDasharray')).toBe('stroke-dasharray');
    expect(getPublicAttributeName('strokeDasharray', true)).toBe(
      'strokeDasharray'
    );
    expect(attributeNamespace('http://www.w3.org/2000/svg', 'xlink:href')).toBe(
      'http://www.w3.org/1999/xlink'
    );
  });
});
