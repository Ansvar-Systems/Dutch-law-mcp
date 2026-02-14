import { describe, it, expect, afterEach } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import {
  detectCapabilities,
  readDbMetadata,
  isProfessionalCapability,
  upgradeMessage,
} from '../src/capabilities.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a minimal in-memory DB with only free-tier tables. */
function createFreeTierDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE legal_provisions (id INTEGER PRIMARY KEY, content TEXT);
    CREATE TABLE case_law (id INTEGER PRIMARY KEY, summary TEXT);
    CREATE TABLE eu_references (id INTEGER PRIMARY KEY, ref_type TEXT);
  `);
  return db;
}

/** Create an in-memory DB with both free and paid tables. */
function createPaidTierDb(): InstanceType<typeof Database> {
  const db = createFreeTierDb();
  db.exec(`
    CREATE TABLE case_law_full (id INTEGER PRIMARY KEY, full_text TEXT);
    CREATE TABLE preparatory_works_full (id INTEGER PRIMARY KEY, full_text TEXT);
    CREATE TABLE agency_guidance (id INTEGER PRIMARY KEY, guidance TEXT);
  `);
  return db;
}

/** Add db_metadata table with given key-value pairs. */
function addMetadata(db: InstanceType<typeof Database>, entries: Record<string, string>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS db_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const insert = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(entries)) {
    insert.run(key, value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('detectCapabilities', () => {
  let db: InstanceType<typeof Database>;

  afterEach(() => {
    if (db) db.close();
  });

  it('should detect free-tier capabilities (3 tables)', () => {
    db = createFreeTierDb();
    const caps = detectCapabilities(db);

    expect(caps.has('core_legislation')).toBe(true);
    expect(caps.has('basic_case_law')).toBe(true);
    expect(caps.has('eu_references')).toBe(true);

    expect(caps.has('expanded_case_law')).toBe(false);
    expect(caps.has('full_preparatory_works')).toBe(false);
    expect(caps.has('agency_guidance')).toBe(false);

    expect(caps.size).toBe(3);
  });

  it('should detect all capabilities on paid-tier DB (6 tables)', () => {
    db = createPaidTierDb();
    const caps = detectCapabilities(db);

    expect(caps.has('core_legislation')).toBe(true);
    expect(caps.has('basic_case_law')).toBe(true);
    expect(caps.has('eu_references')).toBe(true);
    expect(caps.has('expanded_case_law')).toBe(true);
    expect(caps.has('full_preparatory_works')).toBe(true);
    expect(caps.has('agency_guidance')).toBe(true);

    expect(caps.size).toBe(6);
  });

  it('should return empty set for empty database', () => {
    db = new Database(':memory:');
    const caps = detectCapabilities(db);
    expect(caps.size).toBe(0);
  });

  it('should detect partial capabilities (only some tables)', () => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE legal_provisions (id INTEGER PRIMARY KEY);');

    const caps = detectCapabilities(db);
    expect(caps.size).toBe(1);
    expect(caps.has('core_legislation')).toBe(true);
  });
});

describe('readDbMetadata', () => {
  let db: InstanceType<typeof Database>;

  afterEach(() => {
    if (db) db.close();
  });

  it('should read metadata when table exists', () => {
    db = new Database(':memory:');
    addMetadata(db, {
      tier: 'free',
      schema_version: '2',
      built_at: '2026-02-14T10:30:00.000Z',
      builder: 'build-db.ts',
    });

    const meta = readDbMetadata(db);
    expect(meta.tier).toBe('free');
    expect(meta.schema_version).toBe('2');
    expect(meta.built_at).toBe('2026-02-14T10:30:00.000Z');
    expect(meta.builder).toBe('build-db.ts');
  });

  it('should read professional tier', () => {
    db = new Database(':memory:');
    addMetadata(db, {
      tier: 'professional',
      schema_version: '2',
      built_at: '2026-02-14T10:35:00.000Z',
      builder: 'build-db-paid.ts',
    });

    const meta = readDbMetadata(db);
    expect(meta.tier).toBe('professional');
    expect(meta.builder).toBe('build-db-paid.ts');
  });

  it('should return defaults when db_metadata table is missing', () => {
    db = new Database(':memory:');

    const meta = readDbMetadata(db);
    expect(meta.tier).toBe('unknown');
    expect(meta.schema_version).toBe('1');
    expect(meta.built_at).toBe('unknown');
    expect(meta.builder).toBe('unknown');
  });

  it('should return defaults for unknown tier values', () => {
    db = new Database(':memory:');
    addMetadata(db, {
      tier: 'enterprise',
      schema_version: '3',
    });

    const meta = readDbMetadata(db);
    expect(meta.tier).toBe('unknown');
    expect(meta.schema_version).toBe('3');
  });

  it('should handle partial metadata (some keys missing)', () => {
    db = new Database(':memory:');
    addMetadata(db, {
      tier: 'free',
    });

    const meta = readDbMetadata(db);
    expect(meta.tier).toBe('free');
    expect(meta.schema_version).toBe('1');
    expect(meta.built_at).toBe('unknown');
    expect(meta.builder).toBe('unknown');
  });
});

describe('isProfessionalCapability', () => {
  it('should return true for paid capabilities', () => {
    expect(isProfessionalCapability('expanded_case_law')).toBe(true);
    expect(isProfessionalCapability('full_preparatory_works')).toBe(true);
    expect(isProfessionalCapability('agency_guidance')).toBe(true);
  });

  it('should return false for free capabilities', () => {
    expect(isProfessionalCapability('core_legislation')).toBe(false);
    expect(isProfessionalCapability('basic_case_law')).toBe(false);
    expect(isProfessionalCapability('eu_references')).toBe(false);
  });
});

describe('upgradeMessage', () => {
  it('should include the feature name', () => {
    const msg = upgradeMessage('expanded case law');
    expect(msg).toContain('expanded case law');
  });

  it('should mention Professional tier', () => {
    const msg = upgradeMessage('anything');
    expect(msg).toContain('Professional tier');
  });

  it('should mention Dutch Law MCP', () => {
    const msg = upgradeMessage('anything');
    expect(msg).toContain('Dutch Law MCP');
  });

  it('should include contact info', () => {
    const msg = upgradeMessage('anything');
    expect(msg).toContain('hello@ansvar.ai');
  });
});
