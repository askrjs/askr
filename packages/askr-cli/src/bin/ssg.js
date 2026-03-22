#!/usr/bin/env node

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function toFileUrl(filePath) {
  const normalized = resolve(filePath).replace(/\\/g, '/');
  const leadingSlash = normalized.startsWith('/') ? '' : '/';
  return `file://${leadingSlash}${encodeURI(normalized)}`;
}

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

Examples:
  askr-ssg --config ./ssg.config.ts --output ./dist/static
  askr-cli ssg --config ./ssg.config.ts --output ./dist/static --incremental
`;

const defaultDeps = {
  cwd: () => process.cwd(),
  now: () => performance.now(),
  existsSync,
  importConfig: async (filePath) => import(toFileUrl(filePath)),
};

async function loadCreateStaticGen() {
  const mod = await import('@askrjs/askr/ssg');
  if (typeof mod.createStaticGen !== 'function') {
    throw new Error('Failed to load createStaticGen from @askrjs/askr/ssg');
  }
  return mod.createStaticGen;
}

export function parseCliArgs(args) {
  const parsed = {
    configPath: '',
    outputDir: '',
    workers: 1,
    incremental: false,
    changedKeys: [],
    changedRoutes: [],
    forceFull: false,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--config' && i + 1 < args.length) {
      parsed.configPath = args[i + 1];
      i += 1;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      parsed.outputDir = args[i + 1];
      i += 1;
    } else if (args[i] === '--workers' && i + 1 < args.length) {
      parsed.workers = args[i + 1] === 'auto' ? 'auto' : Number(args[i + 1]);
      i += 1;
    } else if (args[i] === '--changed-key' && i + 1 < args.length) {
      parsed.changedKeys.push(args[i + 1]);
      i += 1;
    } else if (args[i] === '--changed-route' && i + 1 < args.length) {
      parsed.changedRoutes.push(args[i + 1]);
      i += 1;
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

function toGenerateOptions(args) {
  return {
    mode: args.incremental ? 'incremental' : 'full',
    changedKeys: args.changedKeys,
    changedRoutes: args.changedRoutes,
    forceFull: args.forceFull,
  };
}

function printSummary(io, outputDir, durationSeconds, result) {
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

export async function runSsgCli(
  args = process.argv.slice(2),
  deps = {},
  io = console
) {
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

  const resolvedDeps = { ...defaultDeps, ...deps };
  const resolvedConfigPath = resolve(resolvedDeps.cwd(), parsed.configPath);
  const resolvedOutputDir = resolve(resolvedDeps.cwd(), parsed.outputDir);

  if (!resolvedDeps.existsSync(resolvedConfigPath)) {
    io.error(`Error: Config file not found: ${resolvedConfigPath}`);
    return 1;
  }

  try {
    io.log(`Loading config: ${resolvedConfigPath}`);

    const configModule = await resolvedDeps.importConfig(resolvedConfigPath);
    const config = configModule.default || configModule;

    if (!Array.isArray(config.routes)) {
      io.error('Error: Config must export routes array');
      return 1;
    }

    io.log(`Generating ${config.routes.length} routes...`);

    const createStaticGen =
      typeof resolvedDeps.createStaticGen === 'function'
        ? resolvedDeps.createStaticGen
        : await loadCreateStaticGen();

    const ssg = createStaticGen({
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
  const code = await runSsgCli(process.argv.slice(2));
  process.exit(code);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath && thisPath === invokedPath) {
  void main();
}
