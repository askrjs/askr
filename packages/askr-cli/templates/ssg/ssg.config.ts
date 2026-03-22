import type { RouteConfig } from '@askrjs/askr/ssg';
import Home from './src/pages/home';
import About from './src/pages/about';
import Example from './src/pages/example';

export const routes: RouteConfig[] = [
  { path: '/', component: Home },
  { path: '/about', component: About },
  { path: '/example', component: Example },
];

export const outputDir = './dist/static';
