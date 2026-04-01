import { registerRoutes } from '@askrjs/askr/router';
import { registerAppRoutes } from './routes';
import { routeAuth } from './routes/auth-config';

registerRoutes(registerAppRoutes, {
  auth: routeAuth,
});
