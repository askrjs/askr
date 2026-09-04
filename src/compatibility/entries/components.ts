/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../components/index';
import type * as Contract from '../contracts/components/index';
export type * from '../contracts/components/index';

const public_ErrorBoundary: typeof Contract.ErrorBoundary =
  implementation.ErrorBoundary as unknown as typeof Contract.ErrorBoundary;

export { public_ErrorBoundary as ErrorBoundary };
