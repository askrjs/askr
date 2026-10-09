import type { ReferenceAttributeCell } from './attrs';
import type { ReferenceAttributes } from './output-reference';

/** The streaming target: `write` plus optional portal host tokens. */
export type SinkTarget = {
  write(html: string): void;
  writePortalHost?: (token: string) => void;
  writeReferenceAttribute?: (
    name: string,
    cell: ReferenceAttributeCell
  ) => void;
  beginAttributeRoot?: () => void;
};

/**
 * Collects writes so they can be published or dropped. An ErrorBoundary's
 * subtree renders into one first, so markup from a subtree that then throws
 * never reaches the response.
 */
export class BufferedSink {
  constructor(private readonly references: ReferenceAttributes) {}

  private readonly operations: Array<
    | { kind: 'text' | 'portal'; text: string }
    | { kind: 'reference'; name: string; cell: ReferenceAttributeCell }
    | { kind: 'root' }
  > = [];

  write(html: string): void {
    if (html) this.operations.push({ kind: 'text', text: html });
  }

  writePortalHost(token: string): void {
    this.operations.push({ kind: 'portal', text: token });
  }

  writeReferenceAttribute(name: string, cell: ReferenceAttributeCell): void {
    this.operations.push({ kind: 'reference', name, cell });
  }

  beginAttributeRoot(): void {
    this.operations.push({ kind: 'root' });
  }

  /** The buffered markup, without portal host tokens. */
  html(): string {
    let html = '';
    for (const operation of this.operations) {
      if (operation.kind === 'text') html += operation.text;
    }
    return html;
  }

  publishTo(sink: SinkTarget): void {
    for (const operation of this.operations) {
      if (operation.kind === 'root') {
        sink.beginAttributeRoot?.();
      } else if (operation.kind === 'reference') {
        if (sink.writeReferenceAttribute) {
          sink.writeReferenceAttribute(operation.name, operation.cell);
        } else {
          sink.write(this.references.token(operation.name, operation.cell));
        }
      } else if (operation.kind === 'portal' && sink.writePortalHost) {
        sink.writePortalHost(operation.text);
      } else {
        sink.write(operation.text);
      }
    }
  }
}

/** Buffers output once a portal host appears so tokens can be resolved. */
export class PortalSink {
  private buffered: string[] | null = null;

  constructor(
    private readonly sink: { write(html: string): void },
    private readonly references: ReferenceAttributes,
    private readonly finalize: (html: string) => string
  ) {}

  write(html: string): void {
    if (!html) return;
    if (this.buffered) this.buffered.push(html);
    else this.sink.write(html);
  }

  writePortalHost(token: string): void {
    (this.buffered ??= []).push(token);
  }

  beginAttributeRoot(): void {
    this.buffered ??= [];
  }

  writeReferenceAttribute(name: string, cell: ReferenceAttributeCell): void {
    (this.buffered ??= []).push(this.references.token(name, cell));
  }

  flush(): void {
    if (this.buffered) this.sink.write(this.finalize(this.buffered.join('')));
  }
}
