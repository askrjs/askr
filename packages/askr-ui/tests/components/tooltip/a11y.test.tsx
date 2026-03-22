import { describe, it } from 'vitest';
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from '../../../src/components/tooltip';
import { expectNoAxeViolations } from '../../accessibility';

describe('Tooltip - Accessibility', () => {
  it('should have no automated axe violations given open tooltip', async () => {
    await expectNoAxeViolations(
      <Tooltip defaultOpen>
        <TooltipTrigger>Help</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>Helpful text</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    );
  });
});
