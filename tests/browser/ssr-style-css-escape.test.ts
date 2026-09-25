import { afterEach, expect, test } from 'vite-plus/test';
import { escapeRawText } from '../../src/ssr/escape';

/**
 * SSR writes every `<` in `<style>` text as the CSS escape `\3c `. A real CSS
 * parser must read it back as `<` inside strings, url() and comments.
 */
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

test('should read the CSS escape of < back as < in strings and url()', () => {
  const style = document.createElement('style');
  style.textContent = escapeRawText(
    '/* a <b> comment */ #ssr-css-escape::after { content: "<b> < c"; }' +
      ' #ssr-css-escape { background-image: url("x<y.png"); }',
    'style'
  );
  document.head.append(style);
  const target = document.createElement('div');
  target.id = 'ssr-css-escape';
  document.body.append(target);
  cleanups.push(() => {
    style.remove();
    target.remove();
  });

  expect(style.textContent).not.toContain('<');
  expect(style.sheet!.cssRules).toHaveLength(2);
  expect(getComputedStyle(target, '::after').content).toBe('"<b> < c"');
  const rule = style.sheet!.cssRules[1] as CSSStyleRule;
  expect(rule.style.backgroundImage).toBe('url("x<y.png")');
});
