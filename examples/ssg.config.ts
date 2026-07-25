import { createRouteRegistry, route } from '@askrjs/askr/router';

const HomePage = () => 'Home';
const AboutPage = () => 'About';

export const registry = createRouteRegistry(() => {
  route('/', HomePage);
  route('/about', AboutPage);
});

export const dataOverrides = {
  '/': { appName: 'askr' },
  '/about': { section: 'about' },
};

export const seed = 12345;
export const concurrency = 1;

const config = {
  registry,
  dataOverrides,
  seed,
  concurrency,
};

export default config;
