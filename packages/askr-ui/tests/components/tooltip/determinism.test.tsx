import { describe, it } from 'vitest';
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from '../../../src/components/tooltip';
import { expectDeterministicRender } from '../../determinism';

describe('Tooltip - Determinism', () => {
  it('should render deterministic tooltip markup', () => {
    expectDeterministicRender(() => (
      <Tooltip defaultOpen>
        <TooltipTrigger>Help</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>Helpful text</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    ));
  });
});
