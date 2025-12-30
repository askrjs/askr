import { state, createIsland } from './src/index';
import {
  createTestContainer,
  flushScheduler,
} from './tests/helpers/test-renderer';

const { container } = createTestContainer();
const Component = () => {
  const count = state(0);
  return <div>{count()}</div>;
};
createIsland({ root: container, component: Component });
flushScheduler();
console.log('JSX - textContent:', container.textContent);
