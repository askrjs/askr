import { expect, test, vi } from 'vite-plus/test';
import { applyStylePropValue } from '../../../src/core/dom/prop-value-style';

test('should parse a string style with a declaration owned by the element document', () => {
  const first = document.createElement('p');
  applyStylePropValue(first, 'color: red; width: 1px', 'color: blue');
  expect(first.style.color).toBe('red');

  const other = document.implementation.createHTMLDocument('other');
  const el = other.createElement('p');
  const created = vi.spyOn(other, 'createElement');
  applyStylePropValue(el, 'color: green; width: 2px', 'color: blue');
  expect(created).toHaveBeenCalledTimes(1);
  expect(el.style.color).toBe('green');
  expect(el.style.width).toBe('2px');
});
