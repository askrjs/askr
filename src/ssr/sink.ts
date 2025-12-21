export interface RenderSink {
  write(html: string): void;
  end(): void;
}

export class StringSink implements RenderSink {
  private chunks: string[] = [];

  write(html: string) {
    if (html) this.chunks.push(html);
  }

  end() {}

  toString() {
    return this.chunks.join('');
  }
}

export class StreamSink implements RenderSink {
  constructor(
    private readonly onChunk: (html: string) => void,
    private readonly onComplete: () => void
  ) {}

  write(html: string) {
    if (html) this.onChunk(html);
  }

  end() {
    this.onComplete();
  }
}
