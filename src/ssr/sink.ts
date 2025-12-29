export interface RenderSink {
  write(html: string): void;
  end(): void;
}

export class StringSink implements RenderSink {
  private chunks: string[] = [];
  private bufferChunks: string[] = [];
  private bufferLen = 0;

  // Reduce array churn by batching many small writes into a larger buffer.
  // This is especially important for large SSR trees where we may write
  // hundreds of thousands of small fragments.
  private static readonly FLUSH_THRESHOLD = 8 * 1024;

  write(html: string) {
    if (!html) return;
    this.bufferChunks.push(html);
    this.bufferLen += html.length;
    if (this.bufferLen >= StringSink.FLUSH_THRESHOLD) {
      this.chunks.push(this.bufferChunks.join(''));
      this.bufferChunks = [];
      this.bufferLen = 0;
    }
  }

  end() {
    if (this.bufferLen) {
      this.chunks.push(this.bufferChunks.join(''));
      this.bufferChunks = [];
      this.bufferLen = 0;
    }
  }

  toString() {
    // Ensure any buffered content is included even if end() wasn't called.
    if (this.bufferLen) {
      this.chunks.push(this.bufferChunks.join(''));
      this.bufferChunks = [];
      this.bufferLen = 0;
    }
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
