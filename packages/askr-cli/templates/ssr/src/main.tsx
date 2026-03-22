import { hydrateSPA, getRoutes } from '@askrjs/askr';

// Import routes (they auto-register)
import './routes';

// Hydrate the pre-rendered HTML with interactivity
hydrateSPA({
  root: 'app',
  routes: getRoutes(),
});
