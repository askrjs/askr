import { describe, it } from 'vite-plus/test';
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from '../../../src/components/composites/accordion';
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
