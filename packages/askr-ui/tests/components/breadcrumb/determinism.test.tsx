import { describe, it } from 'vitest';
import {
  Breadcrumb,
  BreadcrumbCurrent,
  BreadcrumbItem,
  BreadcrumbList,
} from '../../../src/components/breadcrumb';
import { expectDeterministicRender } from '../../determinism';

describe('Breadcrumb - Determinism', () => {
  it('should render deterministic breadcrumb markup', () => {
    expectDeterministicRender(() => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbCurrent>Overview</BreadcrumbCurrent>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ));
  });
});
