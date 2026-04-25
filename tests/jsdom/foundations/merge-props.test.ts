import { describe, it, expect } from 'vite-plus/test';
import { mergeProps } from '../../../src/foundations/utilities/merge-props';

describe('mergeProps (FOUNDATIONS)', () => {
  it('should run injected handler before base handler given same event key', () => {
    const calls: string[] = [];

    const merged = mergeProps(
      { onClick: () => calls.push('base') },
      { onClick: () => calls.push('injected') }
    );

    merged.onClick({ defaultPrevented: false });
    expect(calls).toEqual(['injected', 'base']);
  });
});
