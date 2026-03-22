import { describe, it } from 'vitest';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../src/components/tabs';
import { expectDeterministicRender } from '../../determinism';

describe('Tabs - Determinism', () => {
  it('should render deterministic tabs markup', () => {
    expectDeterministicRender(() => (
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
      </Tabs>
    ));
  });
});
