import { bench, describe } from 'vitest';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '../../src/components/collapsible';

describe('Collapsible benches', () => {
  bench('create closed collapsible', () => {
    Collapsible({
      children: [
        CollapsibleTrigger({ children: 'Toggle' }),
        CollapsibleContent({ children: 'Content' }),
      ],
    });
  });

  bench('create open collapsible', () => {
    Collapsible({
      defaultOpen: true,
      children: [
        CollapsibleTrigger({ children: 'Toggle' }),
        CollapsibleContent({ children: 'Content' }),
      ],
    });
  });

  bench('create disabled collapsible', () => {
    Collapsible({
      disabled: true,
      children: [
        CollapsibleTrigger({ children: 'Toggle' }),
        CollapsibleContent({ children: 'Content' }),
      ],
    });
  });

  bench('create with forceMount', () => {
    Collapsible({
      defaultOpen: false,
      children: [
        CollapsibleTrigger({ children: 'Toggle' }),
        CollapsibleContent({ forceMount: true, children: 'Content' }),
      ],
    });
  });

  bench('state toggle - open to closed to open', () => {
    const onOpenChange = (_open: boolean) => {
      // Simulates state change
    };
    Collapsible({
      open: false,
      onOpenChange,
      children: [
        CollapsibleTrigger({ children: 'Toggle' }),
        CollapsibleContent({ children: 'Content' }),
      ],
    });
    onOpenChange(true);
    onOpenChange(false);
    onOpenChange(true);
  });
});
