import type { RouteConfig } from '../src/ssg/types';

const HomePage = () => 'Home Page';
const AboutPage = () => 'About Page';

export const routes: RouteConfig[] = [
  {
    path: '/',
    component: HomePage,
  },
  {
    path: '/about',
    component: AboutPage,
  },
];

export const dataOverrides = {
  '/': {
    appName: 'askr',
  },
  '/about': {
    section: 'about',
  },
};

export const seed = 12345;
export const concurrency = 1;
