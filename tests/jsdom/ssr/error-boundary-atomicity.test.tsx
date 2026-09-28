/**
 * An ErrorBoundary emits nothing until its protected subtree succeeds.
 *
 * A boundary is transactional: markup produced before a descendant throws must
 * never reach the response, or the fallback is appended to a half-written
 * element. Streaming the subtree straight to the sink cannot take output back,
 * so the protected subtree is buffered and only published once it completes.
 */

import { afterEach, describe, it, expect, vi } from 'vite-plus/test';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  renderToString,
  renderToStream,
  renderToStringSync,
} from '../../../src/ssr';
import { ErrorBoundary } from '../../../src/components';
import { For, Show } from '../../../src/control';
import { currentOwner, onDispose } from '../../../src/core/api/hooks';
import { logger } from '../../../src/common/logger';

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
  afterEach(() => vi.restoreAllMocks());

  it('should preserve a render failure and expose every root cleanup failure', () => {
    const renderFailure = new Error('root render failed');
    const cleanupFailures = [
      new Error('first cleanup failed'),
      new Error('second cleanup failed'),
    ];
    const cleanups: string[] = [];
    const Broken = () => {
      onDispose(currentOwner()!, () => {
        cleanups.push('first');
        throw cleanupFailures[0];
      });
      onDispose(currentOwner()!, () => {
        cleanups.push('second');
        throw cleanupFailures[1];
      });
      throw renderFailure;
    };

    let caught: unknown;
    try {
      renderToStringSync(Broken);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      renderFailure,
      cleanupFailures[1],
      cleanupFailures[0],
    ]);
    expect(cleanups).toEqual(['second', 'first']);
  });

  it('should report failed subtree cleanup after rendering an error boundary fallback', () => {
    const cleanupFailures = [
      new Error('first boundary cleanup failed'),
      new Error('second boundary cleanup failed'),
    ];
    const events: string[] = [];
    const report = vi.spyOn(logger, 'error').mockImplementation((...args) => {
      if (args[0] === '[Askr] SSR ErrorBoundary cleanup failed:') {
        events.push('cleanup report');
      }
    });
    const Broken = () => {
      onDispose(currentOwner()!, () => {
        events.push('first cleanup');
        throw cleanupFailures[0];
      });
      onDispose(currentOwner()!, () => {
        events.push('second cleanup');
        throw cleanupFailures[1];
      });
      throw new Error('boundary render failed');
    };

    const html = renderToStringSync(() => (
      <ErrorBoundary
        fallback={() => {
          events.push('fallback');
          return <p>fallback</p>;
        }}
      >
        <Broken />
      </ErrorBoundary>
    ));

    expect(html).toContain('<p>fallback</p>');
    expect(events).toEqual([
      'second cleanup',
      'first cleanup',
      'fallback',
      'cleanup report',
    ]);
    expect(
      report.mock.calls.find(
        ([message]) => message === '[Askr] SSR ErrorBoundary cleanup failed:'
      )?.[1]
    ).toBeInstanceOf(AggregateError);
    const reportedFailure = report.mock.calls.find(
      ([message]) => message === '[Askr] SSR ErrorBoundary cleanup failed:'
    )?.[1];
    expect((reportedFailure as AggregateError).errors).toEqual(
      cleanupFailures.slice().reverse()
    );
  });

  it('should report raw-text boundary cleanup failures after rendering its fallback', () => {
    const cleanupFailure = new Error('raw-text cleanup failed');
    const events: string[] = [];
    const report = vi.spyOn(logger, 'error').mockImplementation((...args) => {
      if (args[0] === '[Askr] SSR ErrorBoundary cleanup failed:') {
        events.push('cleanup report');
      }
    });
    const Broken = () => {
      onDispose(currentOwner()!, () => {
        throw cleanupFailure;
      });
      throw new Error('raw-text render failed');
    };

    const html = renderToStringSync(() => (
      <style>
        <ErrorBoundary
          fallback={() => {
            events.push('fallback');
            return 'fallback raw text';
          }}
        >
          <Broken />
        </ErrorBoundary>
      </style>
    ));

    expect(html).toBe('<style>fallback raw text</style>');
    expect(events).toEqual(['fallback', 'cleanup report']);
    expect(
      report.mock.calls.find(
        ([message]) => message === '[Askr] SSR ErrorBoundary cleanup failed:'
      )?.[1]
    ).toBe(cleanupFailure);
  });

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
