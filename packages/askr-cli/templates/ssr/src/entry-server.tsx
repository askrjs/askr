import { renderToString } from '@askrjs/askr/ssr';
import { getRoutes } from '@askrjs/askr/router';

// Import routes (they auto-register)
import './routes';

export async function render(url: string) {
  return renderToString({
    url,
    routes: getRoutes(),
  });
}
