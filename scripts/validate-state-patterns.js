#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ignoredDirectories = new Set([
  'dist',
  'node_modules',
  'coverage',
  '.vite',
]);
const stateDeclarationPattern =
  /\b(?:const|let|var)\s+(?!\[)[A-Za-z_$][\w$]*(?:\s*:\s*[^=]+?)?\s*=\s*state\s*\(/;

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function collectFiles(targetPath) {
  const entries = [];

  if (!fs.existsSync(targetPath)) {
    return entries;
  }

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    entries.push(targetPath);
    return entries;
  }

  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      entries.push(...collectFiles(entryPath));
      continue;
    }

    if (allowedExtensions.has(path.extname(entry.name))) {
      entries.push(entryPath);
    }
  }

  return entries;
}

function validateFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const problems = [];

  lines.forEach((line, index) => {
    if (!stateDeclarationPattern.test(line)) {
      return;
    }

    problems.push({
      line: index + 1,
      text: line.trim(),
    });
  });

  return problems;
}

const targetPaths = process.argv.slice(2);

if (targetPaths.length === 0) {
  console.error('Usage: node scripts/validate-state-patterns.js <path...>');
  process.exit(1);
}

const problems = [];

for (const targetPath of targetPaths) {
  for (const filePath of collectFiles(path.resolve(targetPath))) {
    const fileProblems = validateFile(filePath);
    for (const problem of fileProblems) {
      problems.push({
        filePath,
        ...problem,
      });
    }
  }
}

if (problems.length > 0) {
  console.error('State pattern validation failed:');
  for (const problem of problems) {
    const relativePath = toPosix(
      path.relative(process.cwd(), problem.filePath)
    );
    console.error(
      `- ${relativePath}:${problem.line} use array destructuring for state(): ${problem.text}`
    );
  }
  process.exit(1);
}

console.log('State pattern validation passed.');
