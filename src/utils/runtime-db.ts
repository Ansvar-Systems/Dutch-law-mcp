import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const RUNTIME_DB_DIR_ENV_VAR = 'DUTCH_LAW_RUNTIME_DB_DIR';
const RUNTIME_DB_FILENAME = 'database.db';
const RUNTIME_DB_STAMP_FILENAME = 'source.json';

interface RuntimeDbStamp {
  source_path: string;
  size: number;
  mtime_ms: number;
}

interface PrepareRuntimeDatabaseOptions {
  runtimeDir?: string;
}

function getRuntimeDir(overrideDir?: string): string {
  return (
    overrideDir ??
    process.env[RUNTIME_DB_DIR_ENV_VAR] ??
    path.join(os.tmpdir(), 'dutch-law-mcp-runtime')
  );
}

function getRuntimePaths(runtimeDir: string): { dbPath: string; stampPath: string } {
  return {
    dbPath: path.join(runtimeDir, RUNTIME_DB_FILENAME),
    stampPath: path.join(runtimeDir, RUNTIME_DB_STAMP_FILENAME),
  };
}

function readStamp(stampPath: string): RuntimeDbStamp | null {
  try {
    return JSON.parse(fs.readFileSync(stampPath, 'utf-8')) as RuntimeDbStamp;
  } catch {
    return null;
  }
}

function writeStamp(stampPath: string, stamp: RuntimeDbStamp): void {
  fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 2), 'utf-8');
}

function matchesSource(
  stamp: RuntimeDbStamp | null,
  sourcePath: string,
  sourceStat: fs.Stats,
): boolean {
  if (!stamp) return false;
  return (
    stamp.source_path === sourcePath &&
    stamp.size === sourceStat.size &&
    stamp.mtime_ms === sourceStat.mtimeMs
  );
}

function removeStaleLockDir(dbPath: string): void {
  fs.rmSync(`${dbPath}.lock`, { recursive: true, force: true });
}

export function prepareRuntimeDatabase(
  sourcePath: string,
  options: PrepareRuntimeDatabaseOptions = {},
): string {
  const runtimeDir = getRuntimeDir(options.runtimeDir);
  const { dbPath, stampPath } = getRuntimePaths(runtimeDir);
  const sourceStat = fs.statSync(sourcePath);

  fs.mkdirSync(runtimeDir, { recursive: true });

  const existingStamp = readStamp(stampPath);
  if (!fs.existsSync(dbPath) || !matchesSource(existingStamp, sourcePath, sourceStat)) {
    const tmpPath = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
    fs.copyFileSync(sourcePath, tmpPath);
    fs.renameSync(tmpPath, dbPath);
    writeStamp(stampPath, {
      source_path: sourcePath,
      size: sourceStat.size,
      mtime_ms: sourceStat.mtimeMs,
    });
  }

  removeStaleLockDir(dbPath);
  return dbPath;
}
