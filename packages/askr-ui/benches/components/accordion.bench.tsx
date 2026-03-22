import { bench, describe } from 'vitest';
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from '../../src/components/accordion';

describe('Accordion benches', () => {
  bench('create accordion', () => {
    Accordion({
      defaultValue: 'one',
      children: [
        AccordionItem({
          value: 'one',
          children: [
            AccordionHeader({
              children: [AccordionTrigger({ children: 'One' })],
            }),
            AccordionContent({ children: 'First' }),
          ],
        }),
      ],
    });
  });
});
