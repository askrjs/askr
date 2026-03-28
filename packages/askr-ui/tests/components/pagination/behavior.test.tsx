import { describe, expect, it } from 'vite-plus/test';
import { Pagination } from '../../../src/components/composites/pagination';
import { PAGINATION_A11Y_CONTRACT } from '../../../src/components/composites/pagination/pagination.a11y';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('Pagination - Behavior', () => {
  it('should render ellipses and advance current page', async () => {
    const container = mount(<Pagination count={10} defaultPage={5} />);

    try {
      expect(
        container.querySelectorAll(
          `[${PAGINATION_A11Y_CONTRACT.ELLIPSIS_MARKER}="true"]`
        ).length
      ).toBe(2);

      let current = container.querySelector(
        `[${PAGINATION_A11Y_CONTRACT.CURRENT_PAGE_ATTRIBUTE}="${PAGINATION_A11Y_CONTRACT.CURRENT_PAGE_VALUE}"]`
      ) as HTMLButtonElement;
      expect(current.textContent).toBe('5');

      const next = container.querySelector(
        `[aria-label="${PAGINATION_A11Y_CONTRACT.NEXT_LABEL}"]`
      ) as HTMLButtonElement;
      next.click();
      await flushUpdates();

      current = container.querySelector(
        `[${PAGINATION_A11Y_CONTRACT.CURRENT_PAGE_ATTRIBUTE}="${PAGINATION_A11Y_CONTRACT.CURRENT_PAGE_VALUE}"]`
      ) as HTMLButtonElement;
      expect(current.textContent).toBe('6');
    } finally {
      unmount(container);
    }
  });
});
