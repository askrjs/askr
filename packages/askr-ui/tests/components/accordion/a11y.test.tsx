import { describe, it } from 'vite-plus/test';
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from '../../../src/components/composites/accordion';
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
