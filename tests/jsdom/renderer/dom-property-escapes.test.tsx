import { describe, expect, it } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function mount(component: () => unknown) {
  const { container, cleanup } = createTestContainer();
  createIsland({ root: container, component });
  flushScheduler();
  return { container, cleanup };
}

describe('prop:/attr: escape hatches', () => {
  it('should keep the unsafe URL and inline handler guards for attr:', () => {
    function Page() {
      return (
        <a
          attr:href="javascript:alert(1)"
          attr:onclick="alert(1)"
          attr:title="kept"
        >
          link
        </a>
      );
    }

    expect(renderToStringSync(Page)).toBe('<a title="kept">link</a>');

    const { container, cleanup } = mount(Page);
    try {
      const anchor = container.querySelector('a')!;
      expect(anchor.hasAttribute('href')).toBe(false);
      expect(anchor.hasAttribute('onclick')).toBe(false);
      expect(anchor.getAttribute('title')).toBe('kept');
    } finally {
      cleanup();
    }
  });

  it('should keep the unsafe URL guard and refuse raw HTML for prop:', () => {
    function Page() {
      return (
        <div>
          <a prop:href="javascript:alert(1)">link</a>
          <div data-raw prop:innerHTML="<img src=x onerror=alert(1)>" />
        </div>
      );
    }

    expect(renderToStringSync(Page)).toBe(
      '<div><a>link</a><div data-raw="true"></div></div>'
    );

    const { container, cleanup } = mount(Page);
    try {
      expect(container.querySelector('a')!.href).toBe('');
      expect(container.querySelector('[data-raw]')!.innerHTML).toBe('');
    } finally {
      cleanup();
    }
  });
});
