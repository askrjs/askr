import { describe, expect, it } from 'vite-plus/test';
import { IconBase } from '@askrjs/askr/foundations/icon';

describe('IconBase public contract', () => {
  it('should expose decorative icon contract attributes for token sizes', () => {
    const icon = IconBase({
      iconName: 'check',
      size: 'lg',
      strokeWidth: 1.5,
      color: 'currentColor',
      style: 'opacity:0.8',
    });

    expect(icon.props['data-size']).toBe('lg');
    expect(icon.props['data-decorative']).toBe('true');
    expect(icon.props.style).toContain('--ak-icon-size:var(--ak-icon-size-lg');
    expect(icon.props.style).toContain(
      '--ak-icon-stroke-width:var(--ak-icon-stroke-width-lg'
    );
    expect(icon.props.style).toContain('opacity:0.8');
    expect(icon.props['aria-hidden']).toBe('true');
    expect(icon.props['data-color']).toBe('current');
    expect(icon.props['data-icon']).toBe('check');
    expect(icon.props.stroke).toBe('currentColor');
  });

  it('should preserve titled icon metadata without decorative markers', () => {
    const icon = IconBase({
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

    expect(icon.props['data-size']).toBeUndefined();
    expect(icon.props['data-decorative']).toBeUndefined();
    expect(icon.props.style).toContain('--ak-icon-size:16px');
    expect(icon.props.style).toContain(
      '--ak-icon-stroke-width:var(--ak-icon-stroke-width-md, 2)'
    );
    expect(icon.props.style).toContain('margin-inline-start:4px');
    expect(icon.props.style).toContain('opacity:0.75');
    expect(icon.props['aria-hidden']).toBeUndefined();
    expect(icon.props['data-color']).toBeUndefined();
    expect(icon.props['data-icon']).toBe('alert');
    expect(icon.props.stroke).toBe('#f00');
  });
});
