import { describe, it, expect } from 'vitest';
import { mergeProps } from '@askrjs/askr/foundations';

describe('mergeProps (FOUNDATIONS)', () => {
  it('should run injected handler before base handler given same event key', () => {
    const calls: string[] = [];

    const merged = mergeProps(
      { onClick: () => calls.push('base') },
      { onClick: () => calls.push('injected') }
    );

    merged.onClick({ defaultPrevented: false } as any);
    expect(calls).toEqual(['injected', 'base']);
  });
});
