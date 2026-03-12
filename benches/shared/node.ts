export interface BenchTempDirFixture {
  dir: string;
  metadataPath: string;
}

export async function createBenchTempDir(
  prefix: string
): Promise<BenchTempDirFixture> {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return {
    dir,
    metadataPath: path.join(dir, 'metadata.json'),
  };
}

export async function removeBenchTempDir(dir: string): Promise<void> {
  const fs = await import('node:fs');
  fs.rmSync(dir, { recursive: true, force: true });
}
