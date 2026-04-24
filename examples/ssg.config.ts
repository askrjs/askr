const HomePage = () => 'Home';
const AboutPage = () => 'About';

export const routes = [
  { path: '/', component: HomePage },
  { path: '/about', component: AboutPage },
];

export const dataOverrides = {
  '/': { appName: 'askr' },
  '/about': { section: 'about' },
};

export const seed = 12345;
export const concurrency = 1;

const config = {
  routes,
  dataOverrides,
  seed,
  concurrency,
};

export default config;
