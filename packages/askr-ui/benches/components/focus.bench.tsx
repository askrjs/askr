import { bench, describe } from 'vitest';
import { DismissableLayer } from '../../src/components/dismissable-layer';
import { FocusRing } from '../../src/components/focus-ring';
import { FocusScope } from '../../src/components/focus-scope';

describe('Focus foundation benches', () => {
  bench('create FocusRing', () => {
    FocusRing({
      children: <button type="button">Focusable</button>,
    });
  });

  bench('create FocusScope', () => {
    FocusScope({
      loop: true,
      children: [
        <button type="button">First</button>,
        <button type="button">Second</button>,
      ],
    });
  });

  bench('create DismissableLayer', () => {
    DismissableLayer({
      children: <div>Layer</div>,
    });
  });
});
