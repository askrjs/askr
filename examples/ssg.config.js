/**
 * Example SSG configuration for Askr
 *
 * Usage:
 *   askr-ssg --config examples/ssg.config.js --output dist/static
 */

// Import your Askr components
// import { HomePage } from './src/pages/home';
// import { AboutPage } from './src/pages/about';
// import { BlogPostPage } from './src/pages/blog-post';

// For this example, using simple placeholder components
const HomePage = () => 'Home Page';
const AboutPage = () => 'About Page';

/**
 * Routes to generate
 * Each route specifies a path and component to render
 */
export const routes = [
  {
    path: '/',
    component: HomePage,
  },
  {
    path: '/about',
    component: AboutPage,
  },
];

/**
 * Optional: provide data to supply to resources in your components
 *
 * Data is keyed by route path and should match the structure your
 * components expect from resource() calls.
 *
 * In phase 1, data must be supplied manually. Phase 2 will add
 * auto-discovery of resource dependencies.
 */
export const dataOverrides = {
  '/': {
    // Key names match your components' resource() order
    // This is advanced; in most cases, no data override is needed
  },
  '/about': {},
};

/**
 * Optional: seed for deterministic rendering
 * (default: 12345)
 */
export const seed = 12345;

/**
 * Optional: control rendering concurrency
 * (default: 10)
 * Increase for faster generation, decrease to reduce memory usage
 */
export const concurrency = 10;
