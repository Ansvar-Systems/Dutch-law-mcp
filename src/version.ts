/**
 * Single source of truth for the server version.
 *
 * Reads the version from package.json at module load time so that all entry
 * points (stdio, HTTP, Vercel) share the same value without hardcoding.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    // Fallback for bundled environments where package.json path differs
    return process.env.npm_package_version ?? '0.0.0';
  }
}

export const SERVER_VERSION: string = loadVersion();
export const SERVER_NAME = 'dutch-legal-citations';
