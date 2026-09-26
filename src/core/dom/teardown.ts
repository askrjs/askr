/**
 * Failures while tearing down removed content are reported after the update,
 * never thrown into it: the DOM change has already happened and is not
 * rolled back.
 */

import { reportUncaughtErrorLater } from '../../common/report-error';

export function reportTeardown(errors: unknown[]): void {
  if (errors.length === 1) {
    reportUncaughtErrorLater(errors[0]);
  } else if (errors.length > 1) {
    reportUncaughtErrorLater(
      new AggregateError(errors, 'Cleanup failed while removing content')
    );
  }
}
