import { createStaticGen } from '@askrjs/askr/ssg';
import { routes, outputDir } from './ssg.config';

const ssg = createStaticGen({ routes, outputDir });
const result = await ssg.generate();

console.log(`Generated ${result.successful}/${result.totalRoutes} pages`);

if (result.errors && result.errors.length > 0) {
  console.error('Errors:', result.errors);
  process.exit(1);
}
