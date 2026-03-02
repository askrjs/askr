#!/usr/bin/env node

/**
 * askr-ssg CLI
 *
 * Usage: askr-ssg --config path/to/config.js --output dist/static
 *
 * For TypeScript configs, pre-compile to JS or use:
 *   tsx node_modules/@askrjs/askr/dist/ssg-cli.js --config config.ts
 */

import { resolve } from 'path';
import { existsSync } from 'fs';

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  let configPath = '';
  let outputDir = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
askr-ssg - Static Site Generation for Askr

Usage:
  askr-ssg --config <path> --output <dir>

Options:
  --config <path>   Path to SSG config file (JavaScript module)
  --output <dir>    Output directory for generated HTML
  --help            Show this help message

Example:
  askr-ssg --config ./ssg.config.js --output ./dist/static

For TypeScript config files, you can:
  - Pre-compile to JavaScript before running askr-ssg
  - Use tsx: tsx node_modules/.bin/askr-ssg --config config.ts --output dist
      `);
      process.exit(0);
    }
  }

  // Validate arguments
  if (!configPath) {
    console.error('Error: --config argument is required');
    process.exit(1);
  }

  if (!outputDir) {
    console.error('Error: --output argument is required');
    process.exit(1);
  }

  // Resolve paths relative to current working directory
  const resolvedConfigPath = resolve(process.cwd(), configPath);
  const resolvedOutputDir = resolve(process.cwd(), outputDir);

  // Check if config file exists
  if (!existsSync(resolvedConfigPath)) {
    console.error(`Error: Config file not found: ${resolvedConfigPath}`);
    process.exit(1);
  }

  try {
    console.log(`📝 Loading config from: ${resolvedConfigPath}`);

    // Dynamically import the config file
    const configModule = await import(resolvedConfigPath);
    const config = configModule.default || configModule;

    if (!config.routes) {
      console.error('Error: Config must export routes array');
      process.exit(1);
    }

    console.log(`🚀 Generating ${config.routes.length} routes...`);

    // Import SSG from dist
    const { createStaticGen } = await import('@askrjs/askr/ssg');

    // Create and run SSG
    const ssg = createStaticGen({
      routes: config.routes,
      outputDir: resolvedOutputDir,
      seed: config.seed,
      dataOverrides: config.dataOverrides,
      concurrency: config.concurrency,
    });

    const startTime = performance.now();
    const result = await ssg.generate();
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    // Report results
    console.log('');
    console.log(`✅ Generation complete in ${duration}s`);
    console.log(`   Generated: ${result.successful}/${result.totalRoutes} routes`);
    console.log(`   Failed:    ${result.failed} routes`);
    console.log(`   Output:    ${resolvedOutputDir}`);
    console.log(`   Metadata:  ${resolvedOutputDir}/metadata.json`);
    console.log('');

    if (result.failed > 0) {
      console.log('❌ Errors encountered:');
      for (const route of result.routes) {
        if (route.status === 'error') {
          console.log(`   ${route.path}: ${route.error}`);
        }
      }
      console.log('');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Generation failed:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
