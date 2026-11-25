#!/usr/bin/env node
// Removes build artifacts and installed dependencies.
import { rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['build', 'dist', 'node_modules'];

for (const name of targets) {
  const path = resolve(root, name);
  await rm(path, { recursive: true, force: true });
  console.log(`removed ${name}`);
}
