/* eslint-disable askr/no-hardcoded-theme-tokens -- Icon exposes a stable CSS variable contract consumed by themes. */
import { jsx, jsxs } from '../../jsx/jsx-runtime';
import type { IconProps, IconSizeToken, IconStyleObject } from './icon.types';

const ICON_SIZE_TOKENS: readonly IconSizeToken[] = ['sm', 'md', 'lg', 'xl'];

export function isIconSizeToken(value: unknown): value is IconSizeToken {
  return (
    typeof value === 'string' &&
    ICON_SIZE_TOKENS.includes(value as IconSizeToken)
  );
}

export function normalizeIconSizeValue(size: number | string): string {
  if (typeof size === 'number') return `${size}px`;
  return size;
}

export function resolveIconSizeVariable(size: number | string): string {
  if (isIconSizeToken(size)) {
    return `var(--ak-icon-size-${size}, var(--ak-icon-size-md, 1.25rem))`;
  }
  return normalizeIconSizeValue(size);
}

export function resolveIconStrokeWidthVariable(
  strokeWidth: number,
  sizeToken: IconSizeToken | undefined
): string {
  if (sizeToken) {
    return `var(--ak-icon-stroke-width-${sizeToken}, var(--ak-icon-stroke-width-md, ${strokeWidth}))`;
  }
  return `var(--ak-icon-stroke-width-md, ${strokeWidth})`;
}

function camelToKebab(key: string): string {
  return key.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);
}

export function serializeIconStyle(
  style: string | IconStyleObject | undefined
): string {
  if (!style) return '';
  if (typeof style === 'string') return style.trim();
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${camelToKebab(key)}:${String(value)}`)
    .join(';');
}

export function joinIconStyle(
  ...styles: Array<string | undefined>
): string | undefined {
  const merged = styles.map((style) => style?.trim()).filter(Boolean);
  return merged.length > 0 ? merged.join(';') : undefined;
}

export function getIconContractProps({
  size = 20,
  strokeWidth = 2,
  color = 'currentColor',
  title,
  style,
  iconName,
}: Pick<
  IconProps,
  'color' | 'iconName' | 'size' | 'strokeWidth' | 'style' | 'title'
>) {
  const sizeToken = isIconSizeToken(size) ? size : undefined;
  const decorative = title ? undefined : 'true';
  const resolvedSize = resolveIconSizeVariable(size);
  const resolvedStrokeWidth = resolveIconStrokeWidthVariable(
    strokeWidth,
    sizeToken
  );
  const iconStyle = joinIconStyle(
    `--ak-icon-size:${resolvedSize}`,
    `--ak-icon-stroke-width:${resolvedStrokeWidth}`,
    'width:var(--ak-icon-size)',
    'height:var(--ak-icon-size)',
    'stroke-width:var(--ak-icon-stroke-width)',
    serializeIconStyle(style)
  );

  return {
    sizeToken,
    decorative,
    iconStyle,
    attrs: {
      xmlns: 'http://www.w3.org/2000/svg',
      width: 'var(--ak-icon-size)',
      height: 'var(--ak-icon-size)',
      fill: 'none',
      stroke: color,
      'stroke-width': 'var(--ak-icon-stroke-width)',
      role: 'img',
      'aria-hidden': title ? undefined : 'true',
      style: iconStyle,
      'data-slot': 'icon',
      'data-icon': iconName,
      'data-size': sizeToken,
      'data-decorative': decorative,
      'data-color': color === 'currentColor' ? 'current' : undefined,
    },
  };
}

export function IconBase({
  size = 20,
  strokeWidth = 2,
  color = 'currentColor',
  title,
  class: className,
  style,
  iconName,
  children,
  ref,
  ...rest
}: IconProps) {
  const { attrs } = getIconContractProps({
    size,
    strokeWidth,
    color,
    title,
    style,
    iconName,
  });

  const finalChildren = title
    ? [jsx('title', { children: title }), children]
    : children;

  return jsxs('svg', {
    ...rest,
    ...attrs,
    viewBox: rest.viewBox ?? '0 0 24 24',
    'stroke-linecap': rest['stroke-linecap'] ?? 'round',
    'stroke-linejoin': rest['stroke-linejoin'] ?? 'round',
    class: className,
    ref,
    children: finalChildren,
  });
}
