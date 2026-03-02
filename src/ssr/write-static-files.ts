/**
 * File I/O for SSG
 *
 * Writes generated HTML and metadata to disk.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Write HTML content to disk in the expected directory structure.
 *
 * Creates directories as needed and writes {outputDir}/{filePath}.
 *
 * @param outputDir Base output directory
 * @param filePath Relative file path (e.g., "blog/post-1/index.html")
 * @param html HTML content to write
 */
export function writeHTMLFile(
  outputDir: string,
  filePath: string,
  html: string
): void {
  const fullPath = path.join(outputDir, filePath);
  const dir = path.dirname(fullPath);

  // Create directory structure if it doesn't exist
  fs.mkdirSync(dir, { recursive: true });

  // Write HTML file
  fs.writeFileSync(fullPath, html, 'utf8');
}

/**
 * Write metadata as JSON to the output directory.
 *
 * @param outputDir Output directory
 * @param metadata Metadata object to write
 */
export function writeMetadataFile(
  outputDir: string,
  metadata: Record<string, unknown>
): void {
  const filePath = path.join(outputDir, 'metadata.json');

  // Ensure directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Write metadata file with formatting
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
}

/**
 * Check if output directory is safe to write to.
 * Throws if directory exists and is not empty (unless force is true).
 *
 * @param outputDir Directory path
 * @param force If true, overwrite without checking
 */
export function validateOutputDir(outputDir: string, force?: boolean): void {
  if (force) {
    return;
  }

  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir);
    if (files.length > 0 && !files.includes('metadata.json')) {
      // Allow overwriting if only metadata.json exists
      throw new Error(
        `Output directory is not empty: ${outputDir}\nUse force: true to overwrite.`
      );
    }
  }
}

/**
 * Remove all HTML files from output directory (keep metadata.json).
 *
 * @param outputDir Output directory
 */
export function cleanHTMLFiles(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    return;
  }

  const walkDir = (dir: string) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath);
        // Remove empty directories
        try {
          fs.rmdirSync(fullPath);
        } catch {
          // Directory not empty, skip
        }
      } else if (file.endsWith('.html')) {
        fs.unlinkSync(fullPath);
      }
    }
  };

  walkDir(outputDir);
}
