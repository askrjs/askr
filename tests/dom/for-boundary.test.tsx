import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland } from '../../src';
import { createTestContainer } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should not emit wrapper element for For boundary', () => {
  const { container, cleanup } = createTestContainer();

  const Component = () => {
    const rows = [1, 2, 3];
    return {
      type: 'div',
      props: { class: 'wrap' },
      children: [
        For(
          () => rows,
          (n) => n,
          (n) => ({ type: 'div', props: {}, children: [String(n)] })
        ),
      ],
    };
  };

  createIsland({ root: container, component: Component });

  // Expect no <for-boundary> tag — children should be direct divs inside .wrap
  // and they should have data-key automatically injected.
  const html = container.innerHTML.replace(/\s+/g, '');
  expect(html).to.match(
    /^<divclass="wrap"><divdata-key="1">1<\/div><divdata-key="2">2<\/div><divdata-key="3">3<\/div><\/div>(?:<!---->)?$/
  );

  cleanup();
});
