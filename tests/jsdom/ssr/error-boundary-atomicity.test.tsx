/**
 * An ErrorBoundary emits nothing until its protected subtree succeeds.
 *
 * A boundary is transactional: markup produced before a descendant throws must
 * never reach the response, or the fallback is appended to a half-written
 * element. Streaming the subtree straight to the sink cannot take output back,
 * so the protected subtree is buffered and only published once it completes.
 */

import { describe, it, expect } from 'vite-plus/test';
import { routeRegistryFromTable } from '../../router-test-utils';
import { renderToString, renderToStream } from '../../../src/ssr';
import { ErrorBoundary } from '../../../src/components/error-boundary';
import { For } from '../../../src/control/for';
import { Show } from '../../../src/control/show';

function Fail(): never {
  throw new Error('boom');
}

function render(handler: () => unknown): string {
  const registry = routeRegistryFromTable([
    { path: '/', handler: handler as never },
  ]);
  return renderToString({ url: '/', registry });
}

function streamed(handler: () => unknown): string {
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
  return chunks.join('');
}

describe('SSR ErrorBoundary atomicity', () => {
  it('should discard partial markup when a descendant throws at top level', () => {
    const html = render(() => (
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <section>
          <span>discard-me</span>
          <Fail />
        </section>
      </ErrorBoundary>
    ));

    expect(html).toContain('<p>fallback</p>');
    expect(html).not.toContain('discard-me');
    expect(html).not.toContain('<section>');
  });

  it('should discard partial markup for a boundary inside Show', () => {
    const html = render(() => (
      <div>
        <Show when={() => true}>
          <ErrorBoundary fallback={() => <p>fallback</p>}>
            <section>
              <span>discard-me</span>
              <Fail />
            </section>
          </ErrorBoundary>
        </Show>
      </div>
    ));

    expect(html).toContain('<p>fallback</p>');
    expect(html).not.toContain('discard-me');
    expect(html).not.toContain('<section>');
  });

  it('should discard partial markup for a boundary inside For', () => {
    const html = render(() => (
      <ul>
        <For each={[1]} by={(value) => value}>
          {() => (
            <ErrorBoundary fallback={() => <p>fallback</p>}>
              <section>
                <span>discard-me</span>
                <Fail />
              </section>
            </ErrorBoundary>
          )}
        </For>
      </ul>
    ));

    expect(html).toContain('<p>fallback</p>');
    expect(html).not.toContain('discard-me');
    expect(html).not.toContain('<section>');
  });

  it('should stream a recovered boundary identically to renderToString', () => {
    const build = () => (
      <div>
        <Show when={() => true}>
          <ErrorBoundary fallback={() => <p>fallback</p>}>
            <section>
              <span>discard-me</span>
              <Fail />
            </section>
          </ErrorBoundary>
        </Show>
      </div>
    );

    expect(streamed(build)).toBe(render(build));
  });

  it('should still emit a boundary subtree that renders successfully', () => {
    const html = render(() => (
      <div>
        <Show when={() => true}>
          <ErrorBoundary fallback={() => <p>fallback</p>}>
            <section>
              <span>keep-me</span>
            </section>
          </ErrorBoundary>
        </Show>
      </div>
    ));

    expect(html).toContain('keep-me');
    expect(html).toContain('<section>');
    expect(html).not.toContain('fallback');
  });
});
