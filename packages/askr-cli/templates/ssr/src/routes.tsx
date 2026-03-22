import { layout, route } from '@askrjs/askr/router';
import AppLayout from './app';
import Home from './pages/home';
import About from './pages/about';
import Example from './pages/example';

layout(AppLayout, () => {
  route('/', Home);
  route('/about', About);
  route('/example', Example);
});
