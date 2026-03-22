import { axe } from 'vitest-axe';
import { mount, unmount } from './test-utils';

export async function expectNoAxeViolations(element: JSX.Element) {
  const container = mount(element);

  try {
    const results = await axe(container);

    if (results.violations.length > 0) {
      throw new Error(
        `Axe violations found:\n${results.violations
          .map((violation) => `- ${violation.id}: ${violation.description}`)
          .join('\n')}`
      );
    }
  } finally {
    unmount(container);
  }
}
