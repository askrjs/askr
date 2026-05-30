import { describe, expect, it } from 'vite-plus/test';
import {
  getIconContractProps,
  isIconSizeToken,
  joinIconStyle,
  normalizeIconSizeValue,
  resolveIconSizeVariable,
  resolveIconStrokeWidthVariable,
  serializeIconStyle,
} from '@askrjs/askr/foundations/icon';

describe('icon contract helpers (FOUNDATIONS)', () => {
  it('should recognize size tokens and normalize custom sizes', () => {
    expect(isIconSizeToken('md')).toBe(true);
    expect(isIconSizeToken('2rem')).toBe(false);
    expect(normalizeIconSizeValue(24)).toBe('24px');
    expect(normalizeIconSizeValue('1.5rem')).toBe('1.5rem');
  });

  it('should resolve CSS variable-backed icon sizing and stroke width', () => {
    expect(resolveIconSizeVariable('lg')).toBe(
      'var(--ak-icon-size-lg, var(--ak-icon-size-md, 1.25rem))'
    );
    expect(resolveIconSizeVariable(18)).toBe('18px');
    expect(resolveIconStrokeWidthVariable(1.5, 'sm')).toBe(
      'var(--ak-icon-stroke-width-sm, var(--ak-icon-stroke-width-md, 1.5))'
    );
    expect(resolveIconStrokeWidthVariable(2, undefined)).toBe(
      'var(--ak-icon-stroke-width-md, 2)'
    );
  });

  it('should serialize and join inline icon styles', () => {
    expect(
      serializeIconStyle({
        strokeLinecap: 'round',
        opacity: 0.75,
        display: undefined,
        color: null,
      })
    ).toBe('stroke-linecap:round;opacity:0.75');
    expect(serializeIconStyle(' color:red; ')).toBe('color:red;');
    expect(joinIconStyle(' color:red ', undefined, ' width:1rem ')).toBe(
      'color:red;width:1rem'
    );
    expect(joinIconStyle(undefined, '   ')).toBeUndefined();
  });

  it('should expose decorative icon contract attributes for token sizes', () => {
    const { sizeToken, decorative, iconStyle, attrs } = getIconContractProps({
      iconName: 'check',
      size: 'lg',
      strokeWidth: 1.5,
      color: 'currentColor',
      style: 'opacity:0.8',
    });

    expect(sizeToken).toBe('lg');
    expect(decorative).toBe('true');
    expect(iconStyle).toContain('--ak-icon-size:var(--ak-icon-size-lg');
    expect(iconStyle).toContain(
      '--ak-icon-stroke-width:var(--ak-icon-stroke-width-lg'
    );
    expect(iconStyle).toContain('opacity:0.8');
    expect(attrs['aria-hidden']).toBe('true');
    expect(attrs['data-size']).toBe('lg');
    expect(attrs['data-decorative']).toBe('true');
    expect(attrs['data-color']).toBe('current');
    expect(attrs['data-icon']).toBe('check');
    expect(attrs.stroke).toBe('currentColor');
  });

  it('should preserve titled icon metadata without decorative markers', () => {
    const { sizeToken, decorative, iconStyle, attrs } = getIconContractProps({
      iconName: 'alert',
      size: 16,
      strokeWidth: 2,
      color: '#f00',
      title: 'Alert',
      style: {
        marginInlineStart: '4px',
        opacity: 0.75,
      },
    });

    expect(sizeToken).toBeUndefined();
    expect(decorative).toBeUndefined();
    expect(iconStyle).toContain('--ak-icon-size:16px');
    expect(iconStyle).toContain(
      '--ak-icon-stroke-width:var(--ak-icon-stroke-width-md, 2)'
    );
    expect(iconStyle).toContain('margin-inline-start:4px');
    expect(iconStyle).toContain('opacity:0.75');
    expect(attrs['aria-hidden']).toBeUndefined();
    expect(attrs['data-size']).toBeUndefined();
    expect(attrs['data-decorative']).toBeUndefined();
    expect(attrs['data-color']).toBeUndefined();
    expect(attrs['data-icon']).toBe('alert');
    expect(attrs.stroke).toBe('#f00');
  });
});
