import { describe, it } from 'vite-plus/test';
import {
  Breadcrumb,
  BreadcrumbCurrent,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '../../../src/components/composites/breadcrumb';
import { expectNoAxeViolations } from '../../accessibility';

describe('Breadcrumb - Accessibility', () => {
  it('should have no automated axe violations given breadcrumb trail', async () => {
    await expectNoAxeViolations(
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
  });
});
