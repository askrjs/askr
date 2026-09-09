/**
 * Control and deferred boundaries stream incrementally.
 *
 * `renderNodeSyncToSink` used to render a control boundary by calling the
 * string renderer and writing the finished result in one `sink.write`, so a
 * page whose content sits inside a `<For>` — the common shape — buffered its
 * entire subtree before a single byte reached the sink. `StreamSink.write`
 * forwards every write straight to `onChunk`, so the chunk sequence shows
 * exactly what reached the sink and when.
 */

import { describe, it, expect } from 'vite-plus/test';
import { routeRegistryFromTable } from '../../router-test-utils';
import { renderToString, renderToStream } from '../../../src/ssr';
import { For } from '../../../src/control/for';
import { Show } from '../../../src/control/show';

function streamChunks(handler: () => unknown): string[] {
  const registry = routeRegistryFromTable([
    { path: '/', handler: handler as never },
  ]);
  const chunks: string[] = [];
  renderToStream({
    url: '/',
    registry,
    onChunk: (chunk) => chunks.push(chunk),
    onComplete: () => {},
  });
  return chunks;
}

function chunksHolding(chunks: string[], tag: string, atLeast: number) {
  return chunks.filter(
    (chunk) => (chunk.match(new RegExp(`<${tag}`, 'g')) ?? []).length >= atLeast
  );
}

describe('SSR streaming: control boundaries', () => {
  it('should emit each For row as it renders rather than one buffered chunk', () => {
    const chunks = streamChunks(() => (
      <ul>
        <For each={[1, 2, 3, 4]} by={(value) => value}>
          {(value) => <li>{value}</li>}
        </For>
      </ul>
    ));

    // A buffered boundary delivers every row in a single write.
    expect(chunksHolding(chunks, 'li', 2)).toEqual([]);
  });

  it('should emit Show content incrementally', () => {
    const chunks = streamChunks(() => (
      <div>
        <Show when={() => true}>
          <p>one</p>
          <p>two</p>
          <p>three</p>
        </Show>
      </div>
    ));

    expect(chunksHolding(chunks, 'p', 2)).toEqual([]);
  });

  it('should emit a nested For without buffering the outer boundary', () => {
    const chunks = streamChunks(() => (
      <ul>
        <For each={[1, 2]} by={(value) => value}>
          {(outer) => (
            <li>
              <For each={['a', 'b']} by={(value) => value}>
                {(inner) => (
                  <span>
                    {outer}
                    {inner}
                  </span>
                )}
              </For>
            </li>
          )}
        </For>
      </ul>
    ));

    expect(chunksHolding(chunks, 'span', 2)).toEqual([]);
    expect(chunksHolding(chunks, 'li', 2)).toEqual([]);
  });

  it('should stream byte-for-byte the same markup renderToString produces', () => {
    const build = () => (
      <ul>
        <For each={[1, 2, 3]} by={(value) => value}>
          {(value) => <li>{value}</li>}
        </For>
      </ul>
    );
    const registry = routeRegistryFromTable([
      { path: '/', handler: build as never },
    ]);
    const chunks: string[] = [];
    renderToStream({
      url: '/',
      registry,
      onChunk: (chunk) => chunks.push(chunk),
      onComplete: () => {},
    });

    expect(chunks.join('')).toBe(renderToString({ url: '/', registry }));
  });
});
