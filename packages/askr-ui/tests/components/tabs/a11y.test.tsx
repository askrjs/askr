import { describe, it } from 'vite-plus/test';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../src/components/composites/tabs';
import { expectNoAxeViolations } from '../../accessibility';

describe('Tabs - Accessibility', () => {
  it('should have no automated axe violations given tabs with two panels', async () => {
    await expectNoAxeViolations(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="settings">Settings panel</TabsContent>
      </Tabs>
    );
  });
});
