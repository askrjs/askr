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
          (n) => ({ type: 'div', props: { key: n }, children: [String(n)] })
        ),
      ],
    };
  };

  createIsland({ root: container, component: Component });

  // Expect no <for-boundary> tag — children should be direct divs inside .wrap
  const html = container.innerHTML.replace(/\s+/g, '');
  expect(html).to.match(
    /^<divclass="wrap"><div(?:data-key="1")?>1<\/div><div(?:data-key="2")?>2<\/div><div(?:data-key="3")?>3<\/div><\/div>(?:<!---->)?$/
  );

  cleanup();
});
