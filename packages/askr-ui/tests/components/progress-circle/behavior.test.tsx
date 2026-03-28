import { describe, expect, it } from 'vite-plus/test';
import {
  ProgressCircle,
  ProgressCircleIndicator,
} from '../../../src/components/primitives/progress-circle';
import { PROGRESS_CIRCLE_A11Y_CONTRACT } from '../../../src/components/primitives/progress-circle/progress-circle.a11y';
import { mount, unmount } from '../../test-utils';

describe('ProgressCircle - Behavior', () => {
  it('should expose circular progress metadata', () => {
    const container = mount(
      <ProgressCircle value={30} max={60}>
        <ProgressCircleIndicator />
      </ProgressCircle>
    );

    try {
      const circular = container.querySelector(
        `[role="${PROGRESS_CIRCLE_A11Y_CONTRACT.ROLE}"]`
      );
      expect(
        circular?.getAttribute(
          PROGRESS_CIRCLE_A11Y_CONTRACT.VALUE_NOW_ATTRIBUTE
        )
      ).toBe('30');
    } finally {
      unmount(container);
    }
  });

  it('should emit --ak-progress-percentage as a CSS custom property on the root', () => {
    const container = mount(
      <ProgressCircle value={30} max={60}>
        <ProgressCircleIndicator />
      </ProgressCircle>
    );

    try {
      const root = container.querySelector(
        `[role="${PROGRESS_CIRCLE_A11Y_CONTRACT.ROLE}"]`
      ) as HTMLElement;
      expect(root?.getAttribute('style')).toContain(
        '--ak-progress-percentage:50%'
      );
    } finally {
      unmount(container);
    }
  });
});
