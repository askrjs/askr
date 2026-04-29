import { expect, test } from 'vite-plus/test';
import { createIsland } from '../../../src';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

test('should not emit wrapper element for For boundary', () => {
  const { container, cleanup } = createTestContainer();

  const Component = () => {
    const rows = [1, 2, 3];
    return (
      <div class={'wrap'}>
        {
          <For each={() => rows} by={(n) => n}>
            {(n) => <div>{String(n)}</div>}
          </For>
        }
      </div>
    );
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
