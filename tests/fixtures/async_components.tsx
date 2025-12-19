/**
 * Async components for staleness and cancellation testing
 */

import { resource } from '../../src/index';

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
  return { type: 'div', children: [r.value ?? ''] };
};

export const FailingAsync = ({ delay = 50 }: { delay?: number }) => {
  const r = resource(async () => {
    await new Promise((r) => setTimeout(r, delay));
    throw new Error('Async failure');
  }, [delay]);

  return {
    type: 'div',
    children: [r.error ? 'error' : r.pending ? 'pending' : 'ok'],
  };
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

  return {
    type: 'div',
    children: [r.value ?? (r.pending ? 'pending' : 'error')],
  };
};

export const RenderCounter = ({ id = 'comp' }: { id?: string }) => {
  // Use a simple incrementing resource value to simulate render effects
  const r = resource(async () => {
    await new Promise((r) => setTimeout(r, 10));
    return id;
  }, [id]);
  return { type: 'div', props: { 'data-id': id }, children: [r.value ?? ''] };
};
