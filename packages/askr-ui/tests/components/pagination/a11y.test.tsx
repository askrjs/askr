import { describe, it } from 'vitest';
import { Pagination } from '../../../src/components/pagination';
import { expectNoAxeViolations } from '../../accessibility';

describe('Pagination - Accessibility', () => {
  it('should have no automated axe violations given current page context', async () => {
    await expectNoAxeViolations(<Pagination count={10} defaultPage={3} />);
  });
});
