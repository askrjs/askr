import { bench, describe } from 'vite-plus/test';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../src/components/tabs';

describe('Tabs benches', () => {
  bench('create tabs', () => {
    Tabs({
      defaultValue: 'overview',
      children: [
        TabsList({
          children: [TabsTrigger({ value: 'overview', children: 'Overview' })],
        }),
        TabsContent({ value: 'overview', children: 'Panel' }),
      ],
    });
  });
});
