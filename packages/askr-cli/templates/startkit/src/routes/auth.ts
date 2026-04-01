import { lazy, route } from '@askrjs/askr/router';

export function registerAuthRoutes(): void {
  route(
    '/login',
    lazy(() => import('../pages/auth/login'))
  );
}
