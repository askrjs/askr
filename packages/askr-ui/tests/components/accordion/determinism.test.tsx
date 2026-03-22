import { describe, it } from 'vitest';
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from '../../../src/components/accordion';
import { expectDeterministicRender } from '../../determinism';

describe('Accordion - Determinism', () => {
  it('should render deterministic accordion markup', () => {
    expectDeterministicRender(() => (
      <Accordion defaultValue="one">
        <AccordionItem value="one">
          <AccordionHeader>
            <AccordionTrigger>One</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>First</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));
  });
});
