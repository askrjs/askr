import {
  readReferenceAttributeCell,
  renderReferenceAttributeCell,
  type ReferenceAttributeCell,
} from './attrs';
import { StringSink } from './sink';

/** Request-local deferred attribute operations, resolved after portals. */
export class ReferenceAttributes {
  private readonly entries = new Map<
    string,
    { name: string; cell: ReferenceAttributeCell }
  >();
  private nonce: string | null = null;
  private next = 0;

  token(name: string, cell: ReferenceAttributeCell) {
    readReferenceAttributeCell(cell);
    // Portal transport currently retains buffered operations as strings. A
    // request-private nonce prevents caller HTML from impersonating an operation.
    // Generate it lazily so ordinary renders retain their existing execution path.
    if (this.nonce === null) {
      const nonce = globalThis.crypto.getRandomValues(new Uint32Array(4));
      this.nonce = Array.from(nonce, (part) =>
        part.toString(16).padStart(8, '0')
      ).join('');
    }
    const token = `<!--askr-attribute:${this.nonce}:${this.next++}-->`;
    this.entries.set(token, { name, cell });
    return token;
  }

  resolve(html: string) {
    let resolved = html;
    for (const [token, { name, cell }] of this.entries) {
      const sink = new StringSink();
      renderReferenceAttributeCell(name, cell, sink);
      resolved = resolved.replace(token, () => sink.toString());
    }
    return resolved;
  }
}
