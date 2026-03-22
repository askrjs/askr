export function mergeCssVar(
  style: unknown,
  name: string,
  value: string
): string {
  const decl = `${name}:${value}`;

  if (typeof style === 'string') {
    const trimmed = style.trim();
    return trimmed ? `${trimmed};${decl}` : decl;
  }

  if (style && typeof style === 'object') {
    const entries = Object.entries(style as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(
        ([k, v]) =>
          `${k.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`)}:${String(v)}`
      )
      .join(';');
    return entries ? `${entries};${decl}` : decl;
  }

  return decl;
}
