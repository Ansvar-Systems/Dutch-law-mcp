/**
 * ensure-database.ts — Download the SQLite database on first run.
 *
 * Lookup order:
 *   1. DUTCH_LAW_DB_PATH env var  (explicit override)
 *   2. ~/.cache/dutch-law-mcp/database.db  (user cache)
 *   3. <package>/data/database.db  (Docker / legacy)
 *   4. Download from GitHub Releases → save to (2)
 *
 * Uses only Node.js built-ins (https, zlib, fs, path, os) — no extra deps.
 */

import * as fs from 'fs';
import * as https from 'https';
import type * as http from 'http';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_ENV_VAR = 'DUTCH_LAW_DB_PATH';
const CACHE_DIR_NAME = 'dutch-law-mcp';
const DB_FILENAME = 'database.db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Package-relative database path (works when installed or in Docker) */
const PACKAGE_DB_PATH = path.resolve(__dirname, '../../data/database.db');

/** Semver-safe pattern: only allow digits, dots, hyphens, and "latest". */
const SAFE_VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[\w.]+)?$/;

/** Read version from package.json at build time — falls back to "latest" */
function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    const ver = pkg.version ?? 'latest';
    // Validate version to prevent URL injection from tampered package.json
    if (ver !== 'latest' && !SAFE_VERSION_RE.test(ver)) return 'latest';
    return ver;
  } catch {
    return 'latest';
  }
}

function getDownloadUrl(): string {
  const version = getVersion();
  return `https://github.com/Ansvar-Systems/Dutch-law-mcp/releases/download/v${version}/database.db.gz`;
}

/** Platform-appropriate cache directory */
function getCacheDir(): string {
  const base =
    process.env.XDG_CACHE_HOME ??
    (process.platform === 'win32'
      ? (process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'))
      : path.join(os.homedir(), '.cache'));
  return path.join(base, CACHE_DIR_NAME);
}

function getCachePath(): string {
  return path.join(getCacheDir(), DB_FILENAME);
}

// ---------------------------------------------------------------------------
// Size validation
// ---------------------------------------------------------------------------

const MIN_SIZE = 900 * 1024 * 1024; // 900 MB
const MAX_SIZE = 1.2 * 1024 * 1024 * 1024; // 1.2 GB

function validateSize(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.size >= MIN_SIZE && stat.size <= MAX_SIZE;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Progress bar (stderr only — stdout is for MCP JSON-RPC)
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function printProgress(downloaded: number, total: number | null): void {
  const dl = formatBytes(downloaded);
  if (total) {
    const pct = Math.round((downloaded / total) * 100);
    const bar = '='.repeat(Math.floor(pct / 2)).padEnd(50);
    process.stderr.write(`\r  [${bar}] ${pct}% (${dl} / ${formatBytes(total)})`);
  } else {
    process.stderr.write(`\r  Downloaded ${dl}...`);
  }
}

// ---------------------------------------------------------------------------
// HTTP download with redirect following
// ---------------------------------------------------------------------------

function httpsGet(url: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'dutch-law-mcp' } }, resolve).on('error', reject);
  });
}

async function followRedirects(url: string, maxRedirects = 5): Promise<http.IncomingMessage> {
  let currentUrl = url;
  for (let i = 0; i < maxRedirects; i++) {
    const res = await httpsGet(currentUrl);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      currentUrl = res.headers.location;
      res.resume(); // drain response
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw new Error(`HTTP ${status} downloading ${currentUrl}`);
    }
    return res;
  }
  throw new Error('Too many redirects');
}

// ---------------------------------------------------------------------------
// Download with retries
// ---------------------------------------------------------------------------

async function downloadDatabase(destPath: string): Promise<void> {
  const url = getDownloadUrl();
  const tmpPath = destPath + '.tmp';
  const maxRetries = 3;

  process.stderr.write(`[dutch-law-mcp] Database not found locally. Downloading...\n`);
  process.stderr.write(`  URL: ${url}\n`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await followRedirects(url);
      const contentLength = res.headers['content-length']
        ? parseInt(res.headers['content-length'], 10)
        : null;

      // Track download progress
      let downloaded = 0;
      const progressStream = new (await import('stream')).Transform({
        transform(chunk: Buffer, _encoding, callback) {
          downloaded += chunk.length;
          printProgress(downloaded, contentLength);
          callback(null, chunk);
        },
      });

      // Create destination directory
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // Stream: HTTP → progress → gunzip → file
      const gunzip = zlib.createGunzip();
      const fileStream = fs.createWriteStream(tmpPath);

      await pipeline(res, progressStream, gunzip, fileStream);
      process.stderr.write('\n');

      // Validate size
      if (!validateSize(tmpPath)) {
        const size = fs.statSync(tmpPath).size;
        fs.unlinkSync(tmpPath);
        throw new Error(
          `Downloaded database has unexpected size (${formatBytes(size)}). Expected ${formatBytes(MIN_SIZE)} - ${formatBytes(MAX_SIZE)}.`,
        );
      }

      // Atomic rename
      fs.renameSync(tmpPath, destPath);
      process.stderr.write(`[dutch-law-mcp] Database saved to ${destPath}\n`);
      return;
    } catch (err) {
      // Clean up partial download
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
        process.stderr.write(
          `\n[dutch-law-mcp] Download failed (attempt ${attempt}/${maxRetries}): ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.stderr.write(`  Retrying in ${delay / 1000}s...\n`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `Failed to download database after ${maxRetries} attempts: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main: ensure database exists
// ---------------------------------------------------------------------------

/**
 * Ensure the database file exists, downloading it if necessary.
 * Returns the resolved path to the database.
 */
export async function ensureDatabase(): Promise<string> {
  // 1. Explicit env var
  const envPath = process.env[DB_ENV_VAR];
  if (envPath) {
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    throw new Error(`DUTCH_LAW_DB_PATH is set to "${envPath}" but the file does not exist.`);
  }

  // 2. User cache directory
  const cachePath = getCachePath();
  if (fs.existsSync(cachePath) && validateSize(cachePath)) {
    return cachePath;
  }

  // 3. Package-relative (Docker, development)
  if (fs.existsSync(PACKAGE_DB_PATH) && validateSize(PACKAGE_DB_PATH)) {
    return PACKAGE_DB_PATH;
  }

  // 4. Download from GitHub Releases → save to cache
  await downloadDatabase(cachePath);
  return cachePath;
}
