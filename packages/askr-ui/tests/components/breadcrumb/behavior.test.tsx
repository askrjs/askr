import { describe, expect, it } from 'vitest';
import {
  Breadcrumb,
  BreadcrumbCurrent,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '../../../src/components/breadcrumb';
import { BREADCRUMB_A11Y_CONTRACT } from '../../../src/components/breadcrumb/breadcrumb.a11y';
import { mount, unmount } from '../../test-utils';

describe('Breadcrumb - Behavior', () => {
  it('should mark current page and decorative separator correctly', () => {
    const container = mount(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/docs">Docs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbCurrent>Overview</BreadcrumbCurrent>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );

    try {
      expect(
        container.querySelector(
          `[${BREADCRUMB_A11Y_CONTRACT.CURRENT_PAGE_ATTRIBUTE}="${BREADCRUMB_A11Y_CONTRACT.CURRENT_PAGE_VALUE}"]`
        )?.textContent
      ).toBe('Overview');
      expect(
        container.querySelector(
          `[${BREADCRUMB_A11Y_CONTRACT.SEPARATOR_MARKER}="true"]`
        )
      ).not.toBeNull();
    } finally {
      unmount(container);
    }
  });
});
