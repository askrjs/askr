import { lazy, route } from '@askrjs/askr/router';
import { registerAccountRoutes } from './accounts';

export function registerWorkspaceRoutes(): void {
  route(
    '/dashboard',
    lazy(() => import('../../pages/workspace/dashboard'))
  );
  registerAccountRoutes();
  route(
    '/settings',
    lazy(() => import('../../pages/workspace/settings'))
  );
}
