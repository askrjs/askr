#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * askr-ssg CLI
 *
 * Usage: askr-ssg --config path/to/config.ts --output dist/static
 */

import * as pathModule from 'path';
import * as fsModule from 'fs';
import { createStaticGen } from '../ssg/index';

const { resolve } = pathModule;
const { existsSync } = fsModule;

async function main() {
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
  --config <path>   Path to SSG config file (TypeScript module)
  --output <dir>    Output directory for generated HTML
  --help            Show this help message

Example:
  askr-ssg --config ./ssg.config.ts --output ./dist/static

TypeScript config execution:
  Use tsx to run the CLI with TS config loading:
  tsx node_modules/@askrjs/askr/dist/bin/askr-ssg.js --config ./ssg.config.ts --output ./dist/static
      `);
      process.exit(0);
    }
  }

  if (!configPath) {
    console.error('Error: --config argument is required');
    process.exit(1);
  }

  if (!configPath.endsWith('.ts')) {
    console.error('Error: --config must point to a TypeScript file (.ts)');
    process.exit(1);
  }

  if (!outputDir) {
    console.error('Error: --output argument is required');
    process.exit(1);
  }

  const resolvedConfigPath = resolve(process.cwd(), configPath);
  const resolvedOutputDir = resolve(process.cwd(), outputDir);

  if (!existsSync(resolvedConfigPath)) {
    console.error(`Error: Config file not found: ${resolvedConfigPath}`);
    process.exit(1);
  }

  try {
    console.log(`Loading config: ${resolvedConfigPath}`);

    const configModule = await import(resolvedConfigPath);
    const config = configModule.default || configModule;

    if (!config.routes) {
      console.error('Error: Config must export routes array');
      process.exit(1);
    }

    console.log(`Generating ${config.routes.length} routes...`);

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

    console.log('');
    console.log(`Generation complete in ${duration}s`);
    console.log(
      `   Generated: ${result.successful}/${result.totalRoutes} routes`
    );
    console.log(`   Failed:    ${result.failed} routes`);
    console.log(`   Output:    ${resolvedOutputDir}`);
    console.log(`   Metadata:  ${resolvedOutputDir}/metadata.json`);
    console.log('');

    if (result.failed > 0) {
      console.log('Errors encountered:');
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
    console.error('Generation failed:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
