#!/usr/bin/env node

/**
 * askr-ssg CLI
 *
 * Usage: askr-ssg --config path/to/config.ts --output dist/static
 */

import * as pathModule from 'path';
import * as fsModule from 'fs';
import { createStaticGen } from '../ssg/index';
import type { RouteConfig, SSGGenerateOptions, SSGResult } from '../ssg/index';

const { resolve } = pathModule;
const { existsSync } = fsModule;

function toFileUrl(filePath: string): string {
  const normalized = resolve(filePath).replace(/\\/g, '/');
  const leadingSlash = normalized.startsWith('/') ? '' : '/';
  return `file://${leadingSlash}${encodeURI(normalized)}`;
}

export interface ParsedCliArgs {
  configPath: string;
  outputDir: string;
  workers: number | 'auto';
  incremental: boolean;
  changedKeys: string[];
  changedRoutes: string[];
  forceFull: boolean;
  help: boolean;
}

interface CliIo {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface CliDeps {
  cwd: () => string;
  now: () => number;
  existsSync: (path: string) => boolean;
  importConfig: (path: string) => Promise<Record<string, unknown>>;
  createStaticGen: typeof createStaticGen;
}

interface CliConfig {
  routes: RouteConfig[];
  seed?: number;
  dataOverrides?: Record<string, unknown>;
  concurrency?: number;
}

const defaultCliDeps: CliDeps = {
  cwd: () => process.cwd(),
  now: () => performance.now(),
  existsSync,
  importConfig: async (path: string) =>
    (await import(toFileUrl(path))) as Record<string, unknown>,
  createStaticGen,
};

const helpText = `
askr-ssg - Static Site Generation for Askr

Usage:
  askr-ssg --config <path> --output <dir> [--incremental]

Options:
  --config <path>         Path to SSG config file (TypeScript module)
  --output <dir>          Output directory for generated HTML
  --workers <n|auto>      Preferred render worker count for SSG throughput
  --incremental           Use incremental generation if a manifest exists
  --changed-key <key>     Mark an invalidation key as changed (repeatable)
  --changed-route <path>  Mark a concrete route path as changed (repeatable)
  --force-full            Force a full rebuild even with incremental flags
  --help                  Show this help message

Example:
  askr-ssg --config ./ssg.config.ts --output ./dist/static --incremental --changed-key blog/post-123

TypeScript config execution:
  Use tsx to run the CLI with TS config loading:
  tsx node_modules/@askrjs/askr/dist/bin/askr-ssg.js --config ./ssg.config.ts --output ./dist/static
`;

export function parseCliArgs(args: string[]): ParsedCliArgs {
  const parsed: ParsedCliArgs = {
    configPath: '',
    outputDir: '',
    workers: 1,
    incremental: false,
    changedKeys: [],
    changedRoutes: [],
    forceFull: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      parsed.configPath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      parsed.outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--workers' && i + 1 < args.length) {
      parsed.workers = args[i + 1] === 'auto' ? 'auto' : Number(args[i + 1]);
      i++;
    } else if (args[i] === '--changed-key' && i + 1 < args.length) {
      parsed.changedKeys.push(args[i + 1]);
      i++;
    } else if (args[i] === '--changed-route' && i + 1 < args.length) {
      parsed.changedRoutes.push(args[i + 1]);
      i++;
    } else if (args[i] === '--incremental') {
      parsed.incremental = true;
    } else if (args[i] === '--force-full') {
      parsed.forceFull = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      parsed.help = true;
    }
  }

  return parsed;
}

function toGenerateOptions(args: ParsedCliArgs): SSGGenerateOptions {
  return {
    mode: args.incremental ? 'incremental' : 'full',
    changedKeys: args.changedKeys,
    changedRoutes: args.changedRoutes,
    forceFull: args.forceFull,
  };
}

function printSummary(
  io: CliIo,
  outputDir: string,
  durationSeconds: string,
  result: SSGResult
) {
  io.log('');
  io.log(`Generation complete in ${durationSeconds}s`);
  io.log(`   Mode:      ${result.mode}`);
  io.log(`   Generated: ${result.successful}/${result.totalRoutes} routes`);
  io.log(`   Failed:    ${result.failed} routes`);
  io.log(`   Rebuilt:   ${result.rebuilt} routes`);
  io.log(`   Skipped:   ${result.skipped} routes`);
  io.log(`   Removed:   ${result.removed} routes`);
  io.log(`   CacheHit:  ${result.cacheHits} routes`);
  io.log(`   Output:    ${outputDir}`);
  io.log(`   Metadata:  ${outputDir}/metadata.json`);
  io.log('');
}

export async function runCli(
  args: string[],
  deps: Partial<CliDeps> = {},
  io: CliIo = console
): Promise<number> {
  const parsed = parseCliArgs(args);
  if (parsed.help) {
    io.log(helpText);
    return 0;
  }

  if (!parsed.configPath) {
    io.error('Error: --config argument is required');
    return 1;
  }

  if (!parsed.configPath.endsWith('.ts')) {
    io.error('Error: --config must point to a TypeScript file (.ts)');
    return 1;
  }

  if (!parsed.outputDir) {
    io.error('Error: --output argument is required');
    return 1;
  }

  const resolvedDeps = { ...defaultCliDeps, ...deps };
  const resolvedConfigPath = resolve(resolvedDeps.cwd(), parsed.configPath);
  const resolvedOutputDir = resolve(resolvedDeps.cwd(), parsed.outputDir);

  if (!resolvedDeps.existsSync(resolvedConfigPath)) {
    io.error(`Error: Config file not found: ${resolvedConfigPath}`);
    return 1;
  }

  try {
    io.log(`Loading config: ${resolvedConfigPath}`);

    const configModule = await resolvedDeps.importConfig(resolvedConfigPath);
    const config = (configModule.default || configModule) as Partial<CliConfig>;

    if (!Array.isArray(config.routes)) {
      io.error('Error: Config must export routes array');
      return 1;
    }

    io.log(`Generating ${config.routes.length} routes...`);

    const ssg = resolvedDeps.createStaticGen({
      routes: config.routes,
      outputDir: resolvedOutputDir,
      seed: config.seed,
      dataOverrides: config.dataOverrides,
      concurrency: config.concurrency,
      parallelism: parsed.workers,
    });

    const startTime = resolvedDeps.now();
    const result = await ssg.generate(toGenerateOptions(parsed));
    const duration = ((resolvedDeps.now() - startTime) / 1000).toFixed(2);

    printSummary(io, resolvedOutputDir, duration, result);

    if (result.failed > 0) {
      io.log('Errors encountered:');
      for (const route of result.routes) {
        if (route.status === 'error') {
          io.log(`   ${route.path}: ${route.error}`);
        }
      }
      io.log('');
      return 1;
    }

    return 0;
  } catch (error) {
    io.error('Generation failed:');
    io.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      io.error(error.stack);
    }
    return 1;
  }
}

async function main() {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === toFileUrl(process.argv[1])) {
  void main();
}
