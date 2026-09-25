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

  it('should keep the injected handler given a forwarded handler that is undefined', () => {
    const calls: string[] = [];

    // askr-ui style: a wrapper forwards an optional handler it was not given.
    function Primitive(props: { onClick?: (e: unknown) => void }) {
      return mergeProps(props, {
        onClick: () => calls.push('injected'),
      });
    }
    function Wrapper(props: { onClick?: (e: unknown) => void }) {
      return Primitive({ onClick: props.onClick });
    }

    const merged = Wrapper({});

    expect(typeof merged.onClick).toBe('function');
    merged.onClick?.({ defaultPrevented: false });
    expect(calls).toEqual(['injected']);
  });

  it('should keep injected non-handler props given base values that are undefined', () => {
    const merged = mergeProps(
      { 'aria-expanded': undefined, role: undefined, id: 'user-id' },
      { 'aria-expanded': 'false', role: 'menuitem', id: 'generated-id' }
    );

    expect(merged['aria-expanded']).toBe('false');
    expect(merged.role).toBe('menuitem');
    expect(merged.id).toBe('user-id');
  });

  it('should let base clear an injected prop given an explicit null', () => {
    const merged = mergeProps(
      { role: null, onClick: null },
      { role: 'button', onClick: () => {} }
    );

    expect(merged.role).toBeNull();
    expect(merged.onClick).toBeNull();
  });

  it('should include base keys that are undefined only when injected lacks them', () => {
    const merged = mergeProps({ title: undefined }, { id: 'x' });

    expect('title' in merged).toBe(true);
    expect(merged.title).toBeUndefined();
    expect(merged.id).toBe('x');
  });

  it('should copy an undefined base key that only exists on the prototype of injected', () => {
    const merged = mergeProps({ toString: undefined }, { id: 'x' });

    expect(Object.prototype.hasOwnProperty.call(merged, 'toString')).toBe(true);
    expect(merged.toString).toBeUndefined();
  });
});
