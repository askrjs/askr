/** Explicit HTML ownership retains matching descendant identities. */
import { isDevelopmentEnvironment } from '../../common/env';
import { logger } from '../../common/logger';

export function isDangerousInnerHTMLPayload(
  value: unknown
): value is { __html: unknown } {
  return (
    value !== null && typeof value === 'object' && '__html' in (value as object)
  );
}

export function applyDangerousInnerHTMLValue(
  el: Element,
  value: unknown
): void {
  if (!isDangerousInnerHTMLPayload(value)) {
    return;
  }

  if (isDevelopmentEnvironment()) {
    logger.warn(
      '[Askr] dangerouslySetInnerHTML is being used, which bypasses the ' +
        "framework's normal rendering and can introduce XSS vulnerabilities " +
        'if the HTML is derived from untrusted input. Make sure the value is ' +
        'sanitized.'
    );
  }

  const html = value.__html;
  const nextHtml = html === null || html === undefined ? '' : String(html);
  if (hasMatchingInnerHTML(el, nextHtml)) return;
  el.innerHTML = nextHtml;
}

/** Compare parsed HTML without replacing the live descendants. */
function hasMatchingInnerHTML(el: Element, html: string): boolean {
  try {
    if (el.innerHTML === html) return true;
    if (el.childNodes.length === 0 || !el.namespaceURI) return false;
    const template = el.ownerDocument.createElement('template');
    const probe = template.content.ownerDocument.createElementNS(
      el.namespaceURI,
      el.localName
    );
    probe.innerHTML = html;
    return probe.innerHTML === el.innerHTML;
  } catch {
    // This comparison is an optimization; fall back to the normal live write.
    return false;
  }
}
