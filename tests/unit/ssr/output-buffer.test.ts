import { describe, expect, it } from 'vite-plus/test';
import { BufferedSink, PortalSink } from '../../../src/ssr/output-buffer';
import { ReferenceAttributes } from '../../../src/ssr/output-reference';

describe('private SSR output transport', () => {
  it('should publish successful operations in order without committing a discarded buffer', () => {
    const references = new ReferenceAttributes();
    const writes: string[] = [];
    const target = {
      write: (html: string) => writes.push(html),
      beginAttributeRoot: () => writes.push('root'),
      writePortalHost: (token: string) => writes.push(`portal:${token}`),
      writeReferenceAttribute: (
        name: string,
        cell: { value: string | undefined }
      ) => writes.push(`${name}:${cell.value}`),
    };
    const discarded = new BufferedSink(references);
    discarded.write('<broken>');
    discarded.writePortalHost('discarded');
    expect(writes).toEqual([]);

    const successful = new BufferedSink(references);
    successful.beginAttributeRoot();
    successful.write('<div');
    successful.writeReferenceAttribute('aria-controls', { value: 'panel' });
    successful.write('>');
    successful.writePortalHost('host');
    successful.write('</div>');
    successful.publishTo(target);
    expect(writes).toEqual([
      'root',
      '<div',
      'aria-controls:panel',
      '>',
      'portal:host',
      '</div>',
    ]);
  });

  it('should stream the prefix then finalize portals before reading deferred references', () => {
    const references = new ReferenceAttributes();
    const cell = { value: undefined as string | undefined };
    const writes: string[] = [];
    const sink = new PortalSink(
      { write: (html) => writes.push(html) },
      references,
      (html) => {
        cell.value = 'panel&"$&';
        return references.resolve(
          html.replace('HOST', '<section id="panel"></section>')
        );
      }
    );
    sink.write('<header>ready</header>');
    sink.beginAttributeRoot();
    const buffer = new BufferedSink(references);
    buffer.write('<button');
    buffer.writeReferenceAttribute('aria-controls', cell);
    buffer.write('>open</button>');
    buffer.writePortalHost('HOST');
    buffer.publishTo(sink);
    expect(writes).toEqual(['<header>ready</header>']);
    sink.flush();
    expect(writes).toEqual([
      '<header>ready</header>',
      '<button aria-controls="panel&amp;&quot;$&amp;">open</button><section id="panel"></section>',
    ]);
  });

  it('should keep reference tokens request-local and read the latest cell value', () => {
    const first = new ReferenceAttributes();
    const second = new ReferenceAttributes();
    const cell = { value: undefined as string | undefined };
    const token = first.token('aria-labelledby', cell);
    const other = second.token('aria-labelledby', { value: 'other' });
    expect(other).not.toBe(token);
    expect(second.resolve(token)).toBe(token);
    cell.value = 'label';
    expect(first.resolve(token)).toBe(' aria-labelledby="label"');
    cell.value = undefined;
    expect(first.resolve(token)).toBe('');
  });
});
