/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../control/index';
import type * as Contract from '../contracts/control/index';
export type * from '../contracts/control/index';

const public_Case: typeof Contract.Case =
  implementation.Case as unknown as typeof Contract.Case;
const public_For: typeof Contract.For =
  implementation.For as unknown as typeof Contract.For;
const public_Match: typeof Contract.Match =
  implementation.Match as unknown as typeof Contract.Match;
const public_Show: typeof Contract.Show =
  implementation.Show as unknown as typeof Contract.Show;

export {
  public_Case as Case,
  public_For as For,
  public_Match as Match,
  public_Show as Show,
};
