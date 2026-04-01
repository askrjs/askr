import { lazy, route } from '@askrjs/askr/router';

export function registerAccountRoutes(): void {
  route(
    '/accounts',
    lazy(() => import('../../pages/workspace/accounts'))
  );
}
