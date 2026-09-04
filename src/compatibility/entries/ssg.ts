/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../ssg/index';
import type * as Contract from '../contracts/ssg/index';
export type * from '../contracts/ssg/index';

const public_createStaticGen: typeof Contract.createStaticGen =
  implementation.createStaticGen as unknown as typeof Contract.createStaticGen;

export { public_createStaticGen as createStaticGen };
