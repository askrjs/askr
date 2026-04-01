import { lazy, route } from '@askrjs/askr/router';

export function registerPublicRoutes(): void {
  route(
    '/',
    lazy(() => import('../pages/home'))
  );
}
