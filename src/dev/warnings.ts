/**
 * Dev-only invariants and warnings
 */

import { logger } from './logger';

export function invariant(condition: boolean, message: string): void {
  if (!condition) {
    logger.warn(`[askr] ${message}`);
  }
}
