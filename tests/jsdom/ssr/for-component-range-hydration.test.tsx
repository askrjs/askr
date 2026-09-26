import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import { For } from '../../../src/control';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

describe('For component-range row hydration', () => {
  it.each([true, false])(
    'should adopt component text rows between static text siblings (verifyMarkup=%s)',
    async (verifyMarkup) => {
      const { container, cleanup } = createTestContainer();
      const Row = (props: { value: string }) => props.value;
      const Page = () => {
        const rows = state(['a', 'b']);
        return (
          <section>
            {'before'}
            <For each={rows} by={(row) => row}>
              {(row) => <Row value={row} />}
            </For>
            {'after'}
          </section>
        );
      };

      try {
        container.innerHTML = renderToStringSync(Page);
        const section = container.querySelector('section')!;
        const serverText = Array.from(section.childNodes).filter(
          (node) => node.nodeType === Node.TEXT_NODE
        );
        await hydrateSPA({
          root: container,
          registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
          hydrate: { verifyMarkup },
        });
        expect(container.querySelector('section')).toBe(section);
        const clientText = Array.from(section.childNodes).filter(
          (node) => node.nodeType === Node.TEXT_NODE
        );
        expect(clientText).toHaveLength(serverText.length);
        clientText.forEach((node, index) =>
          expect(node).toBe(serverText[index])
        );
      } finally {
        cleanup();
      }
    }
  );

  it.each([true, false])(
    'should adopt fragment rows after a text component (verifyMarkup=%s)',
    async (verifyMarkup) => {
      const { container, cleanup } = createTestContainer();
      const Prefix = () => 'before';
      const Row = (props: { value: string }) => (
        <>
          <b data-row={props.value}>{props.value}</b>
          <i>{'!'}</i>
        </>
      );
      let reorder!: () => void;
      const Page = () => {
        const rows = state(['a', 'b']);
        reorder = () => rows.set(['b', 'a']);
        return (
          <section>
            <Prefix />
            <For each={rows} by={(row) => row}>
              {(row) => <Row value={row} />}
            </For>
            {'after'}
          </section>
        );
      };

      try {
        container.innerHTML = renderToStringSync(Page);
        const section = container.querySelector('section')!;
        const first = section.querySelector('[data-row="a"]');
        const second = section.querySelector('[data-row="b"]');
        const text = Array.from(section.childNodes).filter(
          (node) => node.nodeType === Node.TEXT_NODE
        );
        await hydrateSPA({
          root: container,
          registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
          hydrate: { verifyMarkup },
        });
        expect(container.querySelector('section')).toBe(section);
        expect(section.querySelectorAll('[data-row]')).toHaveLength(2);
        expect(section.querySelector('[data-row="a"]')).toBe(first);
        expect(section.querySelector('[data-row="b"]')).toBe(second);
        const clientText = Array.from(section.childNodes).filter(
          (node) => node.nodeType === Node.TEXT_NODE
        );
        expect(clientText).toHaveLength(text.length);
        clientText.forEach((node, index) => expect(node).toBe(text[index]));

        reorder();
        flushScheduler();
        expect(
          Array.from(section.querySelectorAll('[data-row]'), (node) =>
            node.getAttribute('data-row')
          )
        ).toEqual(['b', 'a']);
        expect(section.querySelector('[data-row="a"]')).toBe(first);
        expect(section.querySelector('[data-row="b"]')).toBe(second);
      } finally {
        cleanup();
      }
    }
  );
});
