const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'sms', 'tel']);
const URL_SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

export function isSafeHref(value: string): boolean {
  const compact = value.trim().replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  const scheme = URL_SCHEME_RE.exec(compact)?.[1]?.toLowerCase();
  return scheme === undefined || SAFE_URL_SCHEMES.has(scheme);
}
