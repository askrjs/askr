/**
 * Async components for staleness and cancellation testing
 */

import { resource } from '../../src/resources';

/**
 * Resource-based test components to replace legacy async components
 */
export const SlowAsync = ({
  delay = 50,
  id = 'slow',
}: {
  delay?: number;
  id?: string;
}) => {
  const r = resource(async () => {
    await new Promise((r) => setTimeout(r, delay));
    return id;
  }, [delay, id]);
  return <div>{r.value ?? ''}</div>;
};

export const FailingAsync = ({ delay = 50 }: { delay?: number }) => {
  const r = resource(async () => {
    await new Promise((r) => setTimeout(r, delay));
    throw new Error('Async failure');
  }, [delay]);

  return <div>{r.error ? 'error' : r.pending ? 'pending' : 'ok'}</div>;
};

export const CancelDetector = ({ delay = 50 }: { delay?: number }) => {
  const r = resource(
    async ({ signal }) => {
      const log: string[] = [];
      log.push('started');
      signal.addEventListener('abort', () => {
        log.push('aborted');
      });
      await new Promise((r) => setTimeout(r, delay));
      if (signal.aborted) {
        log.push('detected-abort');
        return 'Cancelled';
      }
      log.push('completed');
      return log.join(',');
    },
    [delay]
  );

  return <div>{r.value ?? (r.pending ? 'pending' : 'error')}</div>;
};

export const RenderCounter = ({ id = 'comp' }: { id?: string }) => {
  // Use a simple incrementing resource value to simulate render effects
  const r = resource(async () => {
    await new Promise((r) => setTimeout(r, 10));
    return id;
  }, [id]);
  return <div data-id={id}>{r.value ?? ''}</div>;
};
