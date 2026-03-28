import { describe, it } from 'vite-plus/test';
import { Pagination } from '../../../src/components/composites/pagination';
import { expectNoAxeViolations } from '../../accessibility';

describe('Pagination - Accessibility', () => {
  it('should have no automated axe violations given current page context', async () => {
    await expectNoAxeViolations(<Pagination count={10} defaultPage={3} />);
  });
});
