#!/usr/bin/env tsx
/**
 * Dutch Legal Citation database builder.
 *
 * Reads all data/seed/*.json files, creates the full schema, and populates
 * the SQLite database used by the MCP server at runtime.
 *
 * Usage: npm run build:db
 */

import Database from '@ansvar/mcp-sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateCitationSeedFields,
  type CaseLawSeed,
  type DocumentSeed,
  type PreparatoryWorkSeed,
  type ProvisionSeed,
  type ProvisionVersionSeed,
} from './seed-validator.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const DB_PATH = path.resolve(__dirname, '..', 'data', 'database.db');

// ---------------------------------------------------------------------------
// Schema — must match tests/fixtures/test-db.ts exactly
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('statute', 'amvb', 'ministerial_regulation', 'kamerstuk', 'case_law')),
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,
  status TEXT NOT NULL DEFAULT 'in_force'
    CHECK(status IN ('in_force', 'amended', 'repealed', 'not_yet_in_force')),
  issued_date TEXT,
  in_force_date TEXT,
  url TEXT,
  description TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  book TEXT,
  chapter TEXT,
  section TEXT,
  article TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  UNIQUE(document_id, provision_ref)
);

CREATE INDEX idx_provisions_doc ON legal_provisions(document_id);
CREATE INDEX idx_provisions_book ON legal_provisions(document_id, book);
CREATE INDEX idx_provisions_chapter ON legal_provisions(document_id, chapter);

CREATE VIRTUAL TABLE provisions_fts USING fts5(
  content, title,
  content='legal_provisions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER provisions_ai AFTER INSERT ON legal_provisions BEGIN
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provisions_ad AFTER DELETE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provisions_au AFTER UPDATE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TABLE legal_provision_versions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  book TEXT,
  chapter TEXT,
  section TEXT,
  article TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  valid_from TEXT,
  valid_to TEXT
);

CREATE INDEX idx_provision_versions_doc_ref ON legal_provision_versions(document_id, provision_ref);

CREATE VIRTUAL TABLE provision_versions_fts USING fts5(
  content, title,
  content='legal_provision_versions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER provision_versions_ai AFTER INSERT ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provision_versions_ad AFTER DELETE ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(provision_versions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provision_versions_au AFTER UPDATE ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(provision_versions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provision_versions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TABLE case_law (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE REFERENCES legal_documents(id),
  court TEXT NOT NULL,
  ecli TEXT UNIQUE,
  case_number TEXT,
  decision_date TEXT,
  procedure_type TEXT,
  legal_domain TEXT,
  summary TEXT,
  keywords TEXT
);

CREATE VIRTUAL TABLE case_law_fts USING fts5(
  summary, keywords,
  content='case_law',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER case_law_ai AFTER INSERT ON case_law BEGIN
  INSERT INTO case_law_fts(rowid, summary, keywords)
  VALUES (new.id, new.summary, new.keywords);
END;

CREATE TRIGGER case_law_ad AFTER DELETE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, summary, keywords)
  VALUES ('delete', old.id, old.summary, old.keywords);
END;

CREATE TABLE preparatory_works (
  id INTEGER PRIMARY KEY,
  statute_id TEXT NOT NULL REFERENCES legal_documents(id),
  prep_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  kamerstuk_ref TEXT,
  document_type TEXT,
  title TEXT,
  summary TEXT
);

CREATE INDEX idx_prep_statute ON preparatory_works(statute_id);

CREATE VIRTUAL TABLE prep_works_fts USING fts5(
  title, summary,
  content='preparatory_works',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER prep_works_ai AFTER INSERT ON preparatory_works BEGIN
  INSERT INTO prep_works_fts(rowid, title, summary)
  VALUES (new.id, new.title, new.summary);
END;

CREATE TRIGGER prep_works_ad AFTER DELETE ON preparatory_works BEGIN
  INSERT INTO prep_works_fts(prep_works_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, old.summary);
END;

CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  source_provision_ref TEXT,
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,
  ref_type TEXT NOT NULL DEFAULT 'references'
    CHECK(ref_type IN ('references', 'amended_by', 'implements', 'see_also'))
);

CREATE INDEX idx_xref_source ON cross_references(source_document_id);
CREATE INDEX idx_xref_target ON cross_references(target_document_id);

CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  term TEXT NOT NULL,
  term_en TEXT,
  definition TEXT NOT NULL,
  source_provision TEXT,
  UNIQUE(document_id, term)
);

CREATE VIRTUAL TABLE definitions_fts USING fts5(
  term, definition,
  content='definitions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER definitions_ai AFTER INSERT ON definitions BEGIN
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

CREATE TRIGGER definitions_ad AFTER DELETE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
END;

CREATE TABLE IF NOT EXISTS eu_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('directive', 'regulation', 'decision')),
  year INTEGER NOT NULL,
  number INTEGER NOT NULL,
  community TEXT CHECK(community IN ('EU', 'EG', 'EEG', 'Euratom')),
  celex_number TEXT,
  title TEXT,
  title_nl TEXT,
  short_name TEXT,
  adoption_date TEXT,
  entry_into_force_date TEXT,
  in_force BOOLEAN DEFAULT 1,
  amended_by TEXT,
  repeals TEXT,
  url_eur_lex TEXT,
  description TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eu_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK(source_type IN ('provision', 'document', 'case_law')),
  source_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_id INTEGER REFERENCES legal_provisions(id),
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
  eu_article TEXT,
  reference_type TEXT NOT NULL CHECK(reference_type IN (
    'implements', 'supplements', 'applies', 'references', 'complies_with',
    'derogates_from', 'amended_by', 'repealed_by', 'cites_article'
  )),
  reference_context TEXT,
  full_citation TEXT,
  is_primary_implementation BOOLEAN DEFAULT 0,
  implementation_status TEXT CHECK(implementation_status IN ('complete', 'partial', 'pending', 'unknown')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_verified TEXT,
  UNIQUE(source_id, eu_document_id, eu_article)
);

CREATE INDEX IF NOT EXISTS idx_eu_references_document ON eu_references(document_id, eu_document_id);
CREATE INDEX IF NOT EXISTS idx_eu_references_eu_document ON eu_references(eu_document_id, document_id);
CREATE INDEX IF NOT EXISTS idx_eu_references_provision ON eu_references(provision_id, eu_document_id);

-- Database metadata (tier, version, build info)
CREATE TABLE IF NOT EXISTS db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// ---------------------------------------------------------------------------
// Seed file types
// ---------------------------------------------------------------------------

interface DefinitionSeed {
  document_id: string;
  term: string;
  term_en?: string;
  definition: string;
  source_provision?: string;
}

interface CrossReferenceSeed {
  source_document_id: string;
  source_provision_ref?: string;
  target_document_id: string;
  target_provision_ref?: string;
  ref_type?: string;
}

interface EUDocumentSeed {
  id: string;
  type: 'directive' | 'regulation' | 'decision';
  year: number;
  number: number;
  community?: string;
  celex_number?: string;
  title?: string;
  title_nl?: string;
  short_name?: string;
  adoption_date?: string;
  entry_into_force_date?: string;
  in_force?: number;
  amended_by?: string;
  repeals?: string;
  url_eur_lex?: string;
  description?: string;
}

interface EUReferenceSeed {
  source_type: string;
  source_id: string;
  document_id: string;
  provision_id?: number;
  eu_document_id: string;
  eu_article?: string;
  reference_type: string;
  reference_context?: string;
  full_citation?: string;
  is_primary_implementation?: number;
  implementation_status?: string;
}

interface SeedFile {
  documents?: DocumentSeed[];
  provisions?: ProvisionSeed[];
  provision_versions?: ProvisionVersionSeed[];
  case_law?: CaseLawSeed[];
  preparatory_works?: PreparatoryWorkSeed[];
  definitions?: DefinitionSeed[];
  cross_references?: CrossReferenceSeed[];
  eu_documents?: EUDocumentSeed[];
  eu_references?: EUReferenceSeed[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSeedFiles(): SeedFile[] {
  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed directory found at ${SEED_DIR}`);
    return [];
  }

  const files = fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const seeds: SeedFile[] = [];

  for (const file of files) {
    const filePath = path.join(SEED_DIR, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SeedFile;
      seeds.push(parsed);
      console.log(`  Read ${file}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  WARNING: Failed to parse ${file}: ${message}`);
    }
  }

  return seeds;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('=== Dutch Legal Citation Database Builder ===');
  console.log();

  // 1. Remove existing database if present
  if (fs.existsSync(DB_PATH)) {
    console.log(`Removing existing database at ${DB_PATH}`);
    fs.unlinkSync(DB_PATH);
  }

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 2. Create new database
  console.log(`Creating database at ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 3. Create schema
  console.log('Creating schema...');
  db.exec(SCHEMA);
  console.log('Schema created successfully.');

  // 4. Read seed files
  console.log();
  console.log('Reading seed files...');
  const seeds = readSeedFiles();
  validateCitationSeedFields(seeds);

  if (seeds.length === 0) {
    console.log('No seed files found. Database created with empty schema.');
    db.exec('ANALYZE');
    db.close();
    console.log('Done.');
    return;
  }

  // 5. Insert data in a transaction
  console.log();
  console.log('Inserting data...');

  const insertAll = db.transaction(() => {
    // Track inserted IDs for deduplication
    const insertedDocIds = new Set<string>();
    const insertedProvisionKeys = new Set<string>();
    const insertedEuDocIds = new Set<string>();

    // Prepared statements
    const insertDoc = db.prepare(
      `INSERT OR IGNORE INTO legal_documents (id, type, title, title_en, short_name, status, issued_date, in_force_date, url, description)
       VALUES (@id, @type, @title, @title_en, @short_name, @status, @issued_date, @in_force_date, @url, @description)`,
    );

    const insertProv = db.prepare(
      `INSERT OR IGNORE INTO legal_provisions (document_id, provision_ref, book, chapter, section, article, title, content, metadata)
       VALUES (@document_id, @provision_ref, @book, @chapter, @section, @article, @title, @content, @metadata)`,
    );

    const insertProvVer = db.prepare(
      `INSERT INTO legal_provision_versions (document_id, provision_ref, book, chapter, section, article, title, content, metadata, valid_from, valid_to)
       VALUES (@document_id, @provision_ref, @book, @chapter, @section, @article, @title, @content, @metadata, @valid_from, @valid_to)`,
    );

    const insertCase = db.prepare(
      `INSERT OR IGNORE INTO case_law (document_id, court, ecli, case_number, decision_date, procedure_type, legal_domain, summary, keywords)
       VALUES (@document_id, @court, @ecli, @case_number, @decision_date, @procedure_type, @legal_domain, @summary, @keywords)`,
    );

    const insertPrep = db.prepare(
      `INSERT INTO preparatory_works (statute_id, prep_document_id, kamerstuk_ref, document_type, title, summary)
       VALUES (@statute_id, @prep_document_id, @kamerstuk_ref, @document_type, @title, @summary)`,
    );

    const insertDef = db.prepare(
      `INSERT OR IGNORE INTO definitions (document_id, term, term_en, definition, source_provision)
       VALUES (@document_id, @term, @term_en, @definition, @source_provision)`,
    );

    const insertXref = db.prepare(
      `INSERT INTO cross_references (source_document_id, source_provision_ref, target_document_id, target_provision_ref, ref_type)
       VALUES (@source_document_id, @source_provision_ref, @target_document_id, @target_provision_ref, @ref_type)`,
    );

    const insertEuDoc = db.prepare(
      `INSERT OR IGNORE INTO eu_documents (id, type, year, number, community, celex_number, title, title_nl, short_name, adoption_date, entry_into_force_date, in_force, amended_by, repeals, url_eur_lex, description)
       VALUES (@id, @type, @year, @number, @community, @celex_number, @title, @title_nl, @short_name, @adoption_date, @entry_into_force_date, @in_force, @amended_by, @repeals, @url_eur_lex, @description)`,
    );

    const insertEuRef = db.prepare(
      `INSERT OR IGNORE INTO eu_references (source_type, source_id, document_id, provision_id, eu_document_id, eu_article, reference_type, reference_context, full_citation, is_primary_implementation, implementation_status)
       VALUES (@source_type, @source_id, @document_id, @provision_id, @eu_document_id, @eu_article, @reference_type, @reference_context, @full_citation, @is_primary_implementation, @implementation_status)`,
    );

    let docCount = 0;
    let provCount = 0;
    let provVerCount = 0;
    let caseCount = 0;
    let prepCount = 0;
    let defCount = 0;
    let xrefCount = 0;
    let euDocCount = 0;
    let euRefCount = 0;

    for (const seed of seeds) {
      // Documents
      if (seed.documents) {
        for (const doc of seed.documents) {
          if (!insertedDocIds.has(doc.id)) {
            insertDoc.run({
              id: doc.id,
              type: doc.type,
              title: doc.title,
              title_en: doc.title_en ?? null,
              short_name: doc.short_name ?? null,
              status: doc.status ?? 'in_force',
              issued_date: doc.issued_date ?? null,
              in_force_date: doc.in_force_date ?? null,
              url: doc.url ?? null,
              description: doc.description ?? null,
            });
            insertedDocIds.add(doc.id);
            docCount++;
          }
        }
      }

      // EU documents (insert before references)
      if (seed.eu_documents) {
        for (const euDoc of seed.eu_documents) {
          if (!insertedEuDocIds.has(euDoc.id)) {
            insertEuDoc.run({
              id: euDoc.id,
              type: euDoc.type,
              year: euDoc.year,
              number: euDoc.number,
              community: euDoc.community ?? null,
              celex_number: euDoc.celex_number ?? null,
              title: euDoc.title ?? null,
              title_nl: euDoc.title_nl ?? null,
              short_name: euDoc.short_name ?? null,
              adoption_date: euDoc.adoption_date ?? null,
              entry_into_force_date: euDoc.entry_into_force_date ?? null,
              in_force: euDoc.in_force ?? 1,
              amended_by: euDoc.amended_by ?? null,
              repeals: euDoc.repeals ?? null,
              url_eur_lex: euDoc.url_eur_lex ?? null,
              description: euDoc.description ?? null,
            });
            insertedEuDocIds.add(euDoc.id);
            euDocCount++;
          }
        }
      }

      // Provisions (with deduplication)
      if (seed.provisions) {
        for (const prov of seed.provisions) {
          const key = `${prov.document_id}:${prov.provision_ref}`;
          if (!insertedProvisionKeys.has(key)) {
            insertProv.run({
              document_id: prov.document_id,
              provision_ref: prov.provision_ref,
              book: prov.book ?? null,
              chapter: prov.chapter ?? null,
              section: prov.section ?? null,
              article: prov.article,
              title: prov.title ?? null,
              content: prov.content,
              metadata: prov.metadata ?? null,
            });
            insertedProvisionKeys.add(key);
            provCount++;
          }
        }
      }

      // Provision versions — use explicit versions if available,
      // otherwise copy current provisions as a single "current" version
      const versionSource: ProvisionVersionSeed[] =
        seed.provision_versions ??
        seed.provisions?.map((provision): ProvisionVersionSeed => ({ ...provision })) ??
        [];
      if (versionSource) {
        for (const ver of versionSource) {
          insertProvVer.run({
            document_id: ver.document_id ?? seed.documents?.[0]?.id,
            provision_ref: ver.provision_ref,
            book: ver.book ?? null,
            chapter: ver.chapter ?? null,
            section: ver.section ?? null,
            article: ver.article,
            title: ver.title ?? null,
            content: ver.content,
            metadata: ver.metadata ?? null,
            valid_from: ver.valid_from ?? null,
            valid_to: ver.valid_to ?? null,
          });
          provVerCount++;
        }
      }

      // Case law
      if (seed.case_law) {
        for (const cl of seed.case_law) {
          insertCase.run({
            document_id: cl.document_id,
            court: cl.court,
            ecli: cl.ecli ?? null,
            case_number: cl.case_number ?? null,
            decision_date: cl.decision_date ?? null,
            procedure_type: cl.procedure_type ?? null,
            legal_domain: cl.legal_domain ?? null,
            summary: cl.summary ?? null,
            keywords: cl.keywords ?? null,
          });
          caseCount++;
        }
      }

      // Preparatory works
      if (seed.preparatory_works) {
        for (const pw of seed.preparatory_works) {
          // Auto-create placeholder document for missing statute references
          if (pw.statute_id && !insertedDocIds.has(pw.statute_id)) {
            insertDoc.run({
              id: pw.statute_id,
              type: 'statute',
              title: pw.statute_id,
              title_en: null,
              short_name: null,
              status: 'in_force',
              issued_date: null,
              in_force_date: null,
              url: `https://wetten.overheid.nl/${pw.statute_id}`,
              description: null,
            });
            insertedDocIds.add(pw.statute_id);
            docCount++;
          }
          insertPrep.run({
            statute_id: pw.statute_id,
            prep_document_id: pw.prep_document_id,
            kamerstuk_ref: pw.kamerstuk_ref ?? null,
            document_type: pw.document_type ?? null,
            title: pw.title ?? null,
            summary: pw.summary ?? null,
          });
          prepCount++;
        }
      }

      // Definitions
      if (seed.definitions) {
        for (const def of seed.definitions) {
          insertDef.run({
            document_id: def.document_id,
            term: def.term,
            term_en: def.term_en ?? null,
            definition: def.definition,
            source_provision: def.source_provision ?? null,
          });
          defCount++;
        }
      }

      // Cross references
      if (seed.cross_references) {
        for (const xr of seed.cross_references) {
          insertXref.run({
            source_document_id: xr.source_document_id,
            source_provision_ref: xr.source_provision_ref ?? null,
            target_document_id: xr.target_document_id,
            target_provision_ref: xr.target_provision_ref ?? null,
            ref_type: xr.ref_type ?? 'references',
          });
          xrefCount++;
        }
      }

      // EU references
      if (seed.eu_references) {
        for (const ref of seed.eu_references) {
          insertEuRef.run({
            source_type: ref.source_type,
            source_id: ref.source_id,
            document_id: ref.document_id,
            provision_id: ref.provision_id ?? null,
            eu_document_id: ref.eu_document_id,
            eu_article: ref.eu_article ?? null,
            reference_type: ref.reference_type,
            reference_context: ref.reference_context ?? null,
            full_citation: ref.full_citation ?? null,
            is_primary_implementation: ref.is_primary_implementation ?? 0,
            implementation_status: ref.implementation_status ?? null,
          });
          euRefCount++;
        }
      }
    }

    console.log(`  Documents:           ${docCount}`);
    console.log(`  Provisions:          ${provCount}`);
    console.log(`  Provision versions:  ${provVerCount}`);
    console.log(`  Case law:            ${caseCount}`);
    console.log(`  Preparatory works:   ${prepCount}`);
    console.log(`  Definitions:         ${defCount}`);
    console.log(`  Cross references:    ${xrefCount}`);
    console.log(`  EU documents:        ${euDocCount}`);
    console.log(`  EU references:       ${euRefCount}`);

    if (euDocCount === 0 || euRefCount === 0) {
      throw new Error(
        'EU cross-reference data is empty. Run "npm run import:eurlex-documents" and rebuild the database before releasing it.',
      );
    }
  });

  insertAll();

  // 6. Write db_metadata (free tier)
  console.log();
  console.log('Writing db_metadata...');
  const upsertMeta = db.prepare(`
    INSERT INTO db_metadata (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const writeMeta = db.transaction(() => {
    upsertMeta.run('tier', 'free');
    upsertMeta.run('schema_version', '1');
    upsertMeta.run('built_at', new Date().toISOString());
    upsertMeta.run('builder', 'build-db.ts');
  });
  writeMeta();

  // 7. Run ANALYZE for query planner optimization
  console.log();
  console.log('Running ANALYZE...');
  db.exec('ANALYZE');

  // 8. Close
  db.close();
  console.log();
  console.log(`Database built successfully at ${DB_PATH}`);
}

main();
