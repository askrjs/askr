import { describe, expect, it } from 'vite-plus/test';
import {
  Progress,
  ProgressIndicator,
} from '../../../src/components/primitives/progress';
import { PROGRESS_A11Y_CONTRACT } from '../../../src/components/primitives/progress/progress.a11y';
import { mount, unmount } from '../../test-utils';

describe('Progress - Behavior', () => {
  it('should expose progressbar metadata and indicator percentage', () => {
    const container = mount(
      <Progress value={40} max={80}>
        <ProgressIndicator />
      </Progress>
    );

    try {
      const linear = container.querySelector(
        `[role="${PROGRESS_A11Y_CONTRACT.ROLE}"]`
      );
      expect(
        linear?.getAttribute(PROGRESS_A11Y_CONTRACT.VALUE_NOW_ATTRIBUTE)
      ).toBe('40');
      expect(
        container
          .querySelector(`[${PROGRESS_A11Y_CONTRACT.INDICATOR_MARKER}="true"]`)
          ?.getAttribute(PROGRESS_A11Y_CONTRACT.INDICATOR_PERCENTAGE_ATTRIBUTE)
      ).toBe('50');
    } finally {
      unmount(container);
    }
  });

  it('should emit --ak-progress-percentage as a CSS custom property on the root', () => {
    const container = mount(
      <Progress value={40} max={80}>
        <ProgressIndicator />
      </Progress>
    );

    try {
      const root = container.querySelector(
        `[role="${PROGRESS_A11Y_CONTRACT.ROLE}"]`
      ) as HTMLElement;
      expect(root?.getAttribute('style')).toContain(
        '--ak-progress-percentage:50%'
      );
    } finally {
      unmount(container);
    }
  });
});
