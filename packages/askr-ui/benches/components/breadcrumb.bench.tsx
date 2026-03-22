import { bench, describe } from 'vitest';
import {
  Breadcrumb,
  BreadcrumbCurrent,
  BreadcrumbItem,
  BreadcrumbList,
} from '../../src/components/breadcrumb';

describe('Breadcrumb benches', () => {
  bench('create breadcrumb', () => {
    Breadcrumb({
      children: [
        BreadcrumbList({
          children: [
            BreadcrumbItem({
              children: [BreadcrumbCurrent({ children: 'Docs' })],
            }),
          ],
        }),
      ],
    });
  });
});
