import { describe, it } from 'vitest';
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from '../../../src/components/accordion';
import { expectNoAxeViolations } from '../../accessibility';

describe('Accordion - Accessibility', () => {
  it('should have no automated axe violations given open accordion item', async () => {
    await expectNoAxeViolations(
      <Accordion defaultValue="one">
        <AccordionItem value="one">
          <AccordionHeader>
            <AccordionTrigger>One</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>First</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  });
});
