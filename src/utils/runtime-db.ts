import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import Database from '@ansvar/mcp-sqlite';

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

/**
 * Rename legacy agency_guidance table + FTS to parliamentary_proceedings (#54).
 *
 * Idempotent: only fires when the legacy table is present. SQLite ALTER TABLE
 * RENAME does not update FTS5 virtual tables that reference the old name via
 * `content=`, so the FTS shadow is dropped and recreated under the new name
 * and repopulated from the renamed data table.
 */
export function migrateAgencyGuidanceRename(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    // Read the schema via exec-friendly path. Calling .all() on a Statement
    // forces it through to the iterator and lets node-sqlite3-wasm release
    // the read transaction before subsequent DDL.
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agency_guidance'")
      .all() as { name: string }[];
    if (rows.length === 0) return;

    // Drop dependents first so the rename does not have to update triggers
    // that reference the old name. Each statement runs in its own implicit
    // transaction; the block of changes runs sequentially. node-sqlite3-wasm
    // does not always handle BEGIN ... COMMIT across an FTS5 rename + trigger
    // recreate cleanly, so the rename is split into discrete statements and
    // FTS rebuild lives in a single INSERT.
    db.exec('DROP TRIGGER IF EXISTS agency_guidance_ai');
    db.exec('DROP TRIGGER IF EXISTS agency_guidance_ad');
    db.exec('DROP TABLE IF EXISTS agency_guidance_fts');
    db.exec('ALTER TABLE agency_guidance RENAME TO parliamentary_proceedings');
    db.exec(
      `CREATE VIRTUAL TABLE parliamentary_proceedings_fts USING fts5(
        title, summary, full_text,
        content='parliamentary_proceedings',
        content_rowid='id',
        tokenize='unicode61'
      )`,
    );
    db.exec(
      `CREATE TRIGGER parliamentary_proceedings_ai AFTER INSERT ON parliamentary_proceedings BEGIN
        INSERT INTO parliamentary_proceedings_fts(rowid, title, summary, full_text)
        VALUES (new.id, new.title, new.summary, new.full_text);
      END`,
    );
    db.exec(
      `CREATE TRIGGER parliamentary_proceedings_ad AFTER DELETE ON parliamentary_proceedings BEGIN
        INSERT INTO parliamentary_proceedings_fts(parliamentary_proceedings_fts, rowid, title, summary, full_text)
        VALUES ('delete', old.id, old.title, old.summary, old.full_text);
      END`,
    );
    db.exec(
      `INSERT INTO parliamentary_proceedings_fts(rowid, title, summary, full_text)
        SELECT id, title, summary, full_text FROM parliamentary_proceedings`,
    );
  } finally {
    db.close();
  }
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
  migrateAgencyGuidanceRename(dbPath);
  return dbPath;
}
