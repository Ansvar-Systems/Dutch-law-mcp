# Dutch Law MCP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-grade Dutch legal research MCP server — a direct port of the Swedish Law MCP adapted for Dutch legislation, case law, and citation formats.

**Architecture:** 13 MCP tools backed by SQLite (via @ansvar/mcp-sqlite WASM) with FTS5 full-text search. Data ingested from wetten.overheid.nl (SRU/XML), rechtspraak.nl, and EUR-Lex. Zero-hallucination design — only returns verified database entries.

**Tech Stack:** TypeScript ES2022 ESM, @modelcontextprotocol/sdk ^1.25.3, @ansvar/mcp-sqlite ^1.0.0, Vitest, tsx

**Reference:** The Swedish Law MCP at `../Swedish-law-mcp/` is the source template. Port each file, adapting Swedish → Dutch specifics.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "@ansvar/dutch-law-mcp",
  "version": "1.0.0",
  "description": "Production-grade Dutch legal research MCP server with comprehensive statute coverage and EU law cross-references",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "dutch-law-mcp": "dist/index.js"
  },
  "files": [
    "dist",
    "data/database.db"
  ],
  "scripts": {
    "build": "tsc",
    "build:db": "tsx scripts/build-db.ts",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "ingest": "tsx scripts/ingest-bwb.ts",
    "ingest:cases": "tsx scripts/ingest-rechtspraak.ts",
    "ingest:prep-works": "tsx scripts/ingest-preparatory-works.ts",
    "check-updates": "tsx scripts/check-updates.ts",
    "extract:definitions": "tsx scripts/extract-definitions.ts",
    "audit:seeds": "tsx scripts/audit-seeds.ts",
    "fetch:eurlex": "tsx scripts/fetch-eurlex-metadata.ts",
    "import:eurlex-documents": "tsx scripts/import-eurlex-documents.ts",
    "prepublishOnly": "npm run build",
    "postinstall": "test -d dist || npm run build || true"
  },
  "dependencies": {
    "@ansvar/mcp-sqlite": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.25.3"
  },
  "devDependencies": {
    "@types/node": "^22.15.29",
    "fast-xml-parser": "^5.3.5",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  },
  "engines": {
    "node": ">=18"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Ansvar-Systems/Dutch-law-mcp.git"
  },
  "bugs": {
    "url": "https://github.com/Ansvar-Systems/Dutch-law-mcp/issues"
  },
  "homepage": "https://github.com/Ansvar-Systems/Dutch-law-mcp#readme",
  "keywords": [
    "mcp", "model-context-protocol", "ai", "claude",
    "dutch-law", "netherlands", "legal", "compliance",
    "wetten", "bwb", "rechtspraak", "ansvar"
  ],
  "author": "Ansvar Systems AB <hello@ansvar.ai>",
  "license": "Apache-2.0"
}
```

**Step 2: Create tsconfig.json**

Port directly from `../Swedish-law-mcp/tsconfig.json` — identical config.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "verbatimModuleSyntax": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "scripts"]
}
```

**Step 3: Create vitest.config.ts**

Port directly from `../Swedish-law-mcp/vitest.config.ts` — identical config.

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.git'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
    reporters: ['verbose'],
    testTimeout: 5000,
    hookTimeout: 5000,
    fileParallelism: true,
    watchExclude: ['node_modules', 'dist'],
  },
});
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
data/database.db
*.db-journal
*.db-wal
coverage/
.env
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: Clean install, no native module compilation (WASM-based)

**Step 6: Create directory structure**

```bash
mkdir -p src/types src/citation src/parsers src/tools src/utils
mkdir -p tests/fixtures tests/citation tests/parsers tests/tools
mkdir -p scripts data/seed
```

**Step 7: Verify TypeScript compiles**

Create a minimal `src/index.ts`:
```typescript
#!/usr/bin/env node
console.error('[dutch-law-mcp] placeholder');
```

Run: `npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/index.ts
git commit -m "feat: project scaffolding with @ansvar/mcp-sqlite"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types/documents.ts`
- Create: `src/types/provisions.ts`
- Create: `src/types/citations.ts`
- Create: `src/types/eu-references.ts`
- Create: `src/types/index.ts`

**Step 1: Create src/types/documents.ts**

Port from `../Swedish-law-mcp/src/types/documents.ts`. Key changes:
- DocumentType: `'statute' | 'amvb' | 'ministerial_regulation' | 'kamerstuk' | 'case_law'`
- CourtType: Dutch courts (HR, RVS, CRVB, CBB, GHAMS, RBAMS, etc.)
- LegalDocument.id: BWB-ID or ECLI instead of SFS number

```typescript
export type DocumentType = 'statute' | 'amvb' | 'ministerial_regulation' | 'kamerstuk' | 'case_law';

export type DocumentStatus = 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';

export type CourtType =
  | 'HR' | 'PHR'           // Hoge Raad
  | 'RVS' | 'CRVB' | 'CBB' // Administrative highest courts
  | 'GHAMS' | 'GHARL' | 'GHDHA' | 'GHSHE' // Gerechtshoven
  | 'RBAMS' | 'RBDHA' | 'RBGEL' | 'RBMNE' | 'RBNHO' | 'RBNNE' | 'RBOBR' | 'RBOVE' | 'RBROT' | 'RBZWB'; // Rechtbanken

export interface LegalDocument {
  /** BWB-ID (e.g., "BWBR0005289") or ECLI */
  id: string;
  type: DocumentType;
  /** Dutch title */
  title: string;
  title_en?: string;
  /** Short name / abbreviation (e.g., "BW 6", "Sr", "Awb") */
  short_name?: string;
  status: DocumentStatus;
  issued_date?: string;
  in_force_date?: string;
  /** URL to wetten.overheid.nl */
  url?: string;
  description?: string;
}
```

**Step 2: Create src/types/provisions.ts**

Port from Swedish. Key change: add `book` field, rename `section` → `article`, add `section` for afdeling.

```typescript
export interface LegalProvision {
  id: number;
  /** BWB-ID of the parent statute */
  document_id: string;
  /** Provision reference, e.g., "6:162" for Art. 6:162 BW, or "287" for flat statutes */
  provision_ref: string;
  /** Boek number (for BW) */
  book?: string;
  /** Hoofdstuk */
  chapter?: string;
  /** Afdeling/Paragraaf */
  section?: string;
  /** Artikel number */
  article: string;
  /** Article title if present */
  title?: string;
  /** Full text content in Dutch */
  content: string;
  /** JSON metadata: leden, sub-articles */
  metadata?: Record<string, unknown>;
}

export interface ProvisionRef {
  document_id: string;
  book?: string;
  chapter?: string;
  article: string;
}

export interface CrossReference {
  source_document_id: string;
  source_provision_ref?: string;
  target_document_id: string;
  target_provision_ref?: string;
  ref_type: 'references' | 'amended_by' | 'implements' | 'see_also';
}
```

**Step 3: Create src/types/citations.ts**

Port from Swedish. Key changes: Dutch citation types, ECLI support, kamerstukken.

```typescript
import type { DocumentType, DocumentStatus } from './documents.js';

export type CitationFormat = 'full' | 'short' | 'pinpoint';

export interface ParsedCitation {
  raw: string;
  type: DocumentType | 'eu_directive' | 'eu_regulation';
  /** BWB-ID, ECLI, or kamerstuk reference */
  document_id: string;
  /** Book reference for BW (e.g., "6") */
  book?: string;
  /** Article number (e.g., "162") */
  article?: string;
  /** Lid number */
  lid?: string;
  /** Short name used in citation (e.g., "BW", "Sr") */
  code_abbreviation?: string;
  /** ECLI for case law */
  ecli?: string;
  /** Kamerstuk chamber ("I" or "II") */
  chamber?: string;
  valid: boolean;
  error?: string;
}

export interface ValidationResult {
  citation: ParsedCitation;
  document_exists: boolean;
  provision_exists: boolean;
  status?: DocumentStatus;
  document_title?: string;
  warnings: string[];
}
```

**Step 4: Create src/types/eu-references.ts**

Port from Swedish. Key change: `title_sv` → `title_nl`, `SwedishImplementation` → `DutchImplementation`.

```typescript
export type EUDocumentType = 'directive' | 'regulation' | 'decision';
export type EUCommunity = 'EU' | 'EG' | 'EEG' | 'Euratom';

export type ReferenceType =
  | 'implements' | 'supplements' | 'applies' | 'references'
  | 'complies_with' | 'derogates_from' | 'amended_by' | 'repealed_by' | 'cites_article';

export type ImplementationStatus = 'complete' | 'partial' | 'pending' | 'unknown';

export interface EUDocument {
  id: string;
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;
  title?: string;
  title_nl?: string;
  short_name?: string;
  adoption_date?: string;
  entry_into_force_date?: string;
  in_force: boolean;
  amended_by?: string;
  repeals?: string;
  url_eur_lex?: string;
  description?: string;
  last_updated?: string;
}

export interface EUReference {
  id: number;
  source_type: 'provision' | 'document' | 'case_law';
  source_id: string;
  document_id: string;
  provision_id?: number;
  eu_document_id: string;
  eu_article?: string;
  reference_type: ReferenceType;
  reference_context?: string;
  full_citation?: string;
  is_primary_implementation: boolean;
  implementation_status?: ImplementationStatus;
  created_at?: string;
  last_verified?: string;
}

export interface EUBasisDocument {
  id: string;
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;
  title?: string;
  short_name?: string;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  articles?: string[];
  url_eur_lex?: string;
}

export interface DutchImplementation {
  bwb_id: string;
  title: string;
  short_name?: string;
  status: string;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  implementation_status?: ImplementationStatus;
  articles_referenced?: string[];
}

export interface ProvisionEUReference {
  id: string;
  type: EUDocumentType;
  title?: string;
  short_name?: string;
  article?: string;
  reference_type: ReferenceType;
  full_citation: string;
  context?: string;
}
```

**Step 5: Create src/types/index.ts**

```typescript
export type { DocumentType, DocumentStatus, CourtType, LegalDocument } from './documents.js';
export type { LegalProvision, ProvisionRef, CrossReference } from './provisions.js';
export type { CitationFormat, ParsedCitation, ValidationResult } from './citations.js';
export type {
  EUDocumentType, EUCommunity, ReferenceType, ImplementationStatus,
  EUDocument, EUReference, EUBasisDocument, DutchImplementation, ProvisionEUReference,
} from './eu-references.js';
```

**Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/types/
git commit -m "feat: add Dutch law type definitions"
```

---

### Task 3: Utility Functions

**Files:**
- Create: `src/utils/fts-query.ts`
- Create: `src/utils/as-of-date.ts`
- Create: `src/utils/metadata.ts`

**Step 1: Create src/utils/fts-query.ts**

Port directly from `../Swedish-law-mcp/src/utils/fts-query.ts` — identical logic. FTS5 query building is language-agnostic.

```typescript
const EXPLICIT_FTS_SYNTAX_PATTERN = /["*():^]|\bAND\b|\bOR\b|\bNOT\b/iu;

function sanitizeToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}_]/gu, '');
}

function extractTokens(query: string): string[] {
  const matches = query.normalize('NFC').match(/[\p{L}\p{N}_]+/gu) ?? [];
  return matches.map(sanitizeToken).filter(token => token.length > 1);
}

function escapeExplicitQuery(query: string): string {
  return query.replace(/[()^:]/g, (char) => `"${char}"`);
}

function buildPrefixAndQuery(tokens: string[]): string {
  return tokens.map(token => `${token}*`).join(' ');
}

function buildPrefixOrQuery(tokens: string[]): string {
  return tokens.map(token => `${token}*`).join(' OR ');
}

export interface FtsQueryVariants {
  primary: string;
  fallback?: string;
}

export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim();
  if (!trimmed) return { primary: '' };

  if (EXPLICIT_FTS_SYNTAX_PATTERN.test(trimmed)) {
    return { primary: escapeExplicitQuery(trimmed) };
  }

  const tokens = extractTokens(trimmed);
  if (tokens.length === 0) return { primary: escapeExplicitQuery(trimmed) };

  const primary = buildPrefixAndQuery(tokens);
  if (tokens.length === 1) return { primary };

  return { primary, fallback: buildPrefixOrQuery(tokens) };
}
```

**Step 2: Create src/utils/as-of-date.ts**

Port from Swedish. Change: Dutch repeal date pattern `Ingetrokken` instead of Swedish `Upphävd`.

```typescript
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

export function normalizeAsOfDate(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!ISO_DATE_PATTERN.test(trimmed) || !isValidCalendarDate(trimmed)) {
    throw new Error('as_of_date must be an ISO date in YYYY-MM-DD format');
  }
  return trimmed;
}

export function extractRepealDateFromDescription(description: string | null): string | undefined {
  if (!description) return undefined;
  const match = description.match(/Ingetrokken\s+(\d{4}-\d{2}-\d{2})/i)
    || description.match(/Vervallen\s+(\d{4}-\d{2}-\d{2})/i);
  return match?.[1];
}
```

**Step 3: Create src/utils/metadata.ts**

Port from Swedish. Changes: Dutch sources (wetten.overheid.nl, rechtspraak.nl), Dutch disclaimers.

```typescript
import type { Database } from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_freshness: DataFreshness;
  disclaimer: string;
  source_authority: SourceAuthority;
  coverage_gaps: string[];
  ai_disclosure: string;
}

export interface DataFreshness {
  statute_last_updated: string | null;
  case_law_last_sync: string | null;
  staleness_warning: string | null;
}

export interface SourceAuthority {
  primary_source: string;
  authority_level: 'official' | 'community-maintained';
  verification_required: string;
}

export function generateResponseMetadata(db?: Database): ResponseMetadata {
  const dataFreshness = db ? getDataFreshness(db) : getEmptyDataFreshness();
  return {
    data_freshness: dataFreshness,
    disclaimer: 'NOT LEGAL ADVICE. This tool is for research purposes only. Always verify citations with official sources (wetten.overheid.nl, rechtspraak.nl) before relying on them in legal matters.',
    source_authority: {
      primary_source: 'wetten.overheid.nl (official BWB) for statutes; rechtspraak.nl (official open data) for case law',
      authority_level: 'official',
      verification_required: 'ALWAYS cross-check with official sources before using in professional legal work.',
    },
    coverage_gaps: [
      'Full EU directive/regulation text (metadata only)',
      'CJEU case law',
      'Historical statute versions (limited availability)',
      'Legal commentary and annotations',
    ],
    ai_disclosure: 'AI-assisted legal research tool. Results generated by algorithmic search and may contain errors or omissions. Human review required before professional use.',
  };
}

function getEmptyDataFreshness(): DataFreshness {
  return {
    statute_last_updated: null,
    case_law_last_sync: null,
    staleness_warning: 'Data freshness information unavailable',
  };
}

function getDataFreshness(db: Database): DataFreshness {
  let statuteLastUpdated: string | null = null;
  try {
    const row = db.prepare(`SELECT MAX(last_updated) as max_date FROM legal_documents WHERE type = 'statute' AND last_updated IS NOT NULL`).get() as { max_date: string | null } | undefined;
    statuteLastUpdated = row?.max_date || null;
  } catch { /* ignore */ }

  let caseLawLastSync: string | null = null;
  try {
    const row = db.prepare(`SELECT last_sync_date FROM case_law_sync_metadata WHERE id = 1`).get() as { last_sync_date: string } | undefined;
    caseLawLastSync = row?.last_sync_date || null;
  } catch { /* table might not exist */ }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const warnings: string[] = [];

  if (statuteLastUpdated) {
    const ts = new Date(statuteLastUpdated);
    if (ts < thirtyDaysAgo) {
      warnings.push(`Statute data is ${Math.floor((now.getTime() - ts.getTime()) / (24 * 60 * 60 * 1000))} days old`);
    }
  } else {
    warnings.push('Statute update timestamp unavailable');
  }

  if (caseLawLastSync) {
    const ts = new Date(caseLawLastSync);
    if (ts < thirtyDaysAgo) {
      warnings.push(`Case law data is ${Math.floor((now.getTime() - ts.getTime()) / (24 * 60 * 60 * 1000))} days old`);
    }
  }

  return {
    statute_last_updated: statuteLastUpdated,
    case_law_last_sync: caseLawLastSync,
    staleness_warning: warnings.length > 0 ? warnings.join('. ') : null,
  };
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}
```

**Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/utils/
git commit -m "feat: add utility functions (FTS query builder, date handling, metadata)"
```

---

### Task 4: Test Fixture — In-Memory Dutch Law Database

**Files:**
- Create: `tests/fixtures/test-db.ts`

**Step 1: Create the test database fixture**

Port from `../Swedish-law-mcp/tests/fixtures/test-db.ts`. Major changes:
- Schema uses Dutch structure (book column in provisions, ecli in case_law, kamerstuk_ref in preparatory_works)
- Sample data uses Dutch law (BW, Sr, Awb, Gw, UAVG)
- Import from `@ansvar/mcp-sqlite` instead of `better-sqlite3`
- EU documents use Dutch titles (title_nl)

The SCHEMA string must match the design document's SQL exactly. Sample data should include:
- **BWBR0005289** (BW Boek 6) with Art. 6:162 (onrechtmatige daad) — in_force
- **BWBR0001854** (Sr) with Art. 287 (doodslag) — in_force
- **BWBR0005537** (Awb) with Art. 8:1 — in_force
- **BWBR0001840** (Gw) with Art. 1 (gelijkheid) — in_force
- **BWBR0042124** (UAVG - Uitvoeringswet AVG) — in_force (Dutch GDPR implementation)
- A repealed statute for currency checks
- ECLI test case: `ECLI:NL:HR:2019:376` (Hoge Raad)
- Kamerstukken reference
- EU documents: GDPR (regulation:2016/679), Data Protection Directive (directive:95/46)
- EU references: UAVG implements/supplements GDPR

Use `import Database from '@ansvar/mcp-sqlite';` — NOT `better-sqlite3`.

The schema must include all tables from the design document:
- `legal_documents`, `legal_provisions`, `legal_provision_versions`
- FTS5 tables with triggers (`provisions_fts`, `case_law_fts`, `prep_works_fts`, `definitions_fts`, `provision_versions_fts`)
- `case_law`, `preparatory_works`, `cross_references`, `definitions`
- `eu_documents`, `eu_references`

Export: `createTestDatabase()`, `closeTestDatabase(db)`, `sampleData`

**Step 2: Verify test DB creation works**

Create a quick sanity test at `tests/fixtures/test-db.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from './test-db.js';
import type Database from '@ansvar/mcp-sqlite';

describe('test database fixture', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => { db = createTestDatabase(); });
  afterAll(() => { closeTestDatabase(db); });

  it('should have legal documents', () => {
    const count = db.prepare('SELECT COUNT(*) as c FROM legal_documents').get() as { c: number };
    expect(count.c).toBeGreaterThan(0);
  });

  it('should have provisions with FTS', () => {
    const results = db.prepare("SELECT * FROM provisions_fts WHERE provisions_fts MATCH 'onrechtmatige'").all();
    expect(results.length).toBeGreaterThan(0);
  });

  it('should have EU documents', () => {
    const gdpr = db.prepare("SELECT * FROM eu_documents WHERE id = 'regulation:2016/679'").get();
    expect(gdpr).toBeDefined();
  });
});
```

Run: `npx vitest run tests/fixtures/test-db.test.ts`
Expected: 3 tests PASS

**Step 3: Commit**

```bash
git add tests/fixtures/
git commit -m "feat: add in-memory Dutch law test database fixture"
```

---

### Task 5: Citation Parser

**Files:**
- Create: `src/citation/parser.ts`
- Create: `tests/citation/parser.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseCitation } from '../../src/citation/parser.js';

describe('parseCitation', () => {
  describe('statute citations', () => {
    it('should parse "Art. 6:162 BW"', () => {
      const result = parseCitation('Art. 6:162 BW');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('statute');
      expect(result.code_abbreviation).toBe('BW');
      expect(result.book).toBe('6');
      expect(result.article).toBe('162');
    });

    it('should parse "art. 287 Sr"', () => {
      const result = parseCitation('art. 287 Sr');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('statute');
      expect(result.code_abbreviation).toBe('Sr');
      expect(result.article).toBe('287');
      expect(result.book).toBeUndefined();
    });

    it('should parse "Art. 6:162 lid 2 BW"', () => {
      const result = parseCitation('Art. 6:162 lid 2 BW');
      expect(result.valid).toBe(true);
      expect(result.lid).toBe('2');
    });

    it('should parse "artikel 1 Gw"', () => {
      const result = parseCitation('artikel 1 Gw');
      expect(result.valid).toBe(true);
      expect(result.code_abbreviation).toBe('Gw');
      expect(result.article).toBe('1');
    });

    it('should parse "art. 8:1 Awb"', () => {
      const result = parseCitation('art. 8:1 Awb');
      expect(result.valid).toBe(true);
      expect(result.code_abbreviation).toBe('Awb');
      expect(result.book).toBe('8');
      expect(result.article).toBe('1');
    });
  });

  describe('ECLI citations', () => {
    it('should parse "ECLI:NL:HR:2019:376"', () => {
      const result = parseCitation('ECLI:NL:HR:2019:376');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('case_law');
      expect(result.ecli).toBe('ECLI:NL:HR:2019:376');
    });

    it('should parse "ECLI:NL:RBAMS:2023:1234"', () => {
      const result = parseCitation('ECLI:NL:RBAMS:2023:1234');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('case_law');
    });
  });

  describe('kamerstukken citations', () => {
    it('should parse "Kamerstukken II 2020/21, 35815, nr. 2"', () => {
      const result = parseCitation('Kamerstukken II 2020/21, 35815, nr. 2');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('kamerstuk');
      expect(result.chamber).toBe('II');
    });
  });

  describe('EU citations', () => {
    it('should parse "Richtlijn (EU) 2019/770"', () => {
      const result = parseCitation('Richtlijn (EU) 2019/770');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('eu_directive');
    });

    it('should parse "Verordening (EU) 2016/679"', () => {
      const result = parseCitation('Verordening (EU) 2016/679');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('eu_regulation');
    });
  });

  describe('invalid citations', () => {
    it('should reject empty string', () => {
      const result = parseCitation('');
      expect(result.valid).toBe(false);
    });

    it('should reject unrecognized format', () => {
      const result = parseCitation('some random text');
      expect(result.valid).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/citation/parser.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement the citation parser**

Create `src/citation/parser.ts` with regex patterns from the design doc. The parser should try each pattern in priority order:
1. ECLI (`ECLI:NL:...`)
2. Kamerstukken (`Kamerstukken I/II ...`)
3. EU directive (`Richtlijn ...`)
4. EU regulation (`Verordening ...`)
5. Statute (`Art. X:Y CODE` or `art. X CODE`)

Key code abbreviation → BWB-ID mapping:
```typescript
const CODE_TO_BWB: Record<string, string> = {
  'BW': 'BWBR0005289',  // Note: this is BW Boek 6; real mapping needs book-awareness
  'Sr': 'BWBR0001854',
  'Sv': 'BWBR0001903',
  'Awb': 'BWBR0005537',
  'Gw': 'BWBR0001840',
  'Fw': 'BWBR0001860',
  'WvK': 'BWBR0001838',
  'Rv': 'BWBR0001827',
  'Wft': 'BWBR0020368',
  'Wm': 'BWBR0003245',
  'WOR': 'BWBR0002747',
  'WVW': 'BWBR0006622',
};
```

Export: `parseCitation(citation: string): ParsedCitation`

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/citation/parser.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/citation/parser.ts tests/citation/parser.test.ts
git commit -m "feat: add Dutch citation parser with statute, ECLI, kamerstukken, EU support"
```

---

### Task 6: Citation Formatter

**Files:**
- Create: `src/citation/formatter.ts`
- Create: `tests/citation/formatter.test.ts`

**Step 1: Write failing tests**

Test cases: format Dutch citations in full/short/pinpoint formats.
- Full: `Art. 6:162 BW` → `Art. 6:162 Burgerlijk Wetboek Boek 6`
- Short: stay as `Art. 6:162 BW`
- Pinpoint: `Art. 6:162 lid 2 BW`
- ECLI formatting: `ECLI:NL:HR:2019:376`

**Step 2: Run to verify fail**
**Step 3: Implement formatter**
**Step 4: Run to verify pass**
**Step 5: Commit**

```bash
git add src/citation/formatter.ts tests/citation/formatter.test.ts
git commit -m "feat: add Dutch citation formatter"
```

---

### Task 7: Citation Validator

**Files:**
- Create: `src/citation/validator.ts`
- Create: `tests/citation/validator.test.ts`

**Step 1: Write failing tests**

Test cases using test DB:
- Valid citation that exists: `Art. 6:162 BW` → document_exists: true, provision_exists: true
- Valid citation, document missing: `Art. 999 Gw` → provision_exists: false
- Repealed statute warning
- Invalid citation format

**Step 2: Run to verify fail**
**Step 3: Implement validator** — calls `parseCitation()`, then queries DB for document + provision existence
**Step 4: Run to verify pass**
**Step 5: Commit**

```bash
git add src/citation/validator.ts tests/citation/validator.test.ts
git commit -m "feat: add Dutch citation validator (zero-hallucination enforcer)"
```

---

### Task 8: Core Tool — search_legislation

**Files:**
- Create: `src/tools/search-legislation.ts`
- Create: `tests/tools/search-legislation.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { searchLegislation } from '../../src/tools/search-legislation.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('search_legislation', () => {
  let db: any;
  beforeAll(() => { db = createTestDatabase(); });
  afterAll(() => { closeTestDatabase(db); });

  it('should find provisions by keyword', async () => {
    const result = await searchLegislation(db, { query: 'onrechtmatige' });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('should return empty for no matches', async () => {
    const result = await searchLegislation(db, { query: 'xyznonexistent' });
    expect(result.results.length).toBe(0);
  });

  it('should respect limit parameter', async () => {
    const result = await searchLegislation(db, { query: 'artikel', limit: 2 });
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  it('should filter by document_id', async () => {
    const result = await searchLegislation(db, { query: 'artikel', document_id: 'BWBR0001854' });
    for (const r of result.results) {
      expect(r.document_id).toBe('BWBR0001854');
    }
  });

  it('should include metadata', async () => {
    const result = await searchLegislation(db, { query: 'onrechtmatige' });
    expect(result._metadata).toBeDefined();
    expect(result._metadata.disclaimer).toContain('NOT LEGAL ADVICE');
  });
});
```

**Step 2: Run to verify fail**
**Step 3: Implement search_legislation**

Port from `../Swedish-law-mcp/src/tools/search-legislation.ts`. Core logic:
- Build FTS query variants using `buildFtsQueryVariants()`
- Query `provisions_fts` joined with `legal_provisions` and `legal_documents`
- Use `bm25(provisions_fts)` for relevance ranking
- Support `as_of_date` by querying `legal_provision_versions` instead
- Return `ToolResponse<SearchResult[]>` with `_metadata`

**Step 4: Run to verify pass**
**Step 5: Commit**

```bash
git add src/tools/search-legislation.ts tests/tools/search-legislation.test.ts
git commit -m "feat: add search_legislation tool with FTS5"
```

---

### Task 9: Core Tool — get_provision

**Files:**
- Create: `src/tools/get-provision.ts`
- Create: `tests/tools/get-provision.test.ts`

Port from Swedish. Key changes:
- Input: `document_id` (BWB-ID), `article_ref` (e.g., "6:162"), `book`, `as_of_date`
- Query by `provision_ref` matching
- Support omitting article_ref to get all provisions in a statute

**Step 1: Write failing tests**
**Step 2: Run to verify fail**
**Step 3: Implement**
**Step 4: Run to verify pass**
**Step 5: Commit**

```bash
git add src/tools/get-provision.ts tests/tools/get-provision.test.ts
git commit -m "feat: add get_provision tool"
```

---

### Task 10: Core Tool — search_case_law

**Files:**
- Create: `src/tools/search-case-law.ts`
- Create: `tests/tools/search-case-law.test.ts`

Port from Swedish. Key changes:
- Filter by Dutch court codes (HR, RVS, RBAMS, etc.)
- ECLI-based lookup
- `legal_domain` filter
- `procedure_type` filter

**Step 1-5: TDD cycle + commit**

```bash
git commit -m "feat: add search_case_law tool"
```

---

### Task 11: Core Tool — get_preparatory_works

**Files:**
- Create: `src/tools/get-preparatory-works.ts`
- Create: `tests/tools/get-preparatory-works.test.ts`

Port from Swedish. Returns kamerstukken (MvT, MvA, etc.) linked to a statute.

**Step 1-5: TDD cycle + commit**

```bash
git commit -m "feat: add get_preparatory_works tool"
```

---

### Task 12: Core Tool — validate_citation

**Files:**
- Create: `src/tools/validate-citation.ts`
- Create: `tests/tools/validate-citation.test.ts`

Wraps the citation validator from Task 7 as an MCP tool. This is the zero-hallucination enforcer.

**Step 1-5: TDD cycle + commit**

```bash
git commit -m "feat: add validate_citation tool (zero-hallucination enforcer)"
```

---

### Task 13: Core Tool — build_legal_stance

**Files:**
- Create: `src/tools/build-legal-stance.ts`
- Create: `tests/tools/build-legal-stance.test.ts`

Multi-source aggregation: searches statutes + case law + preparatory works simultaneously. Reuses `searchLegislation`, `searchCaseLaw` internally.

**Step 1-5: TDD cycle + commit**

```bash
git commit -m "feat: add build_legal_stance tool"
```

---

### Task 14: Core Tool — format_citation

**Files:**
- Create: `src/tools/format-citation.ts`
- Create: `tests/tools/format-citation.test.ts`

Wraps the citation formatter from Task 6 as an MCP tool.

**Step 1-5: TDD cycle + commit**

```bash
git commit -m "feat: add format_citation tool"
```

---

### Task 15: Core Tool — check_currency

**Files:**
- Create: `src/tools/check-currency.ts`
- Create: `tests/tools/check-currency.test.ts`

Port from Swedish. Checks geldigheid (in-force status) of a statute/provision. Key changes:
- Uses Dutch repeal patterns (`Ingetrokken`, `Vervallen`)
- Returns document status with dates and warnings

**Step 1-5: TDD cycle + commit**

```bash
git commit -m "feat: add check_currency tool"
```

---

### Task 16: EU Tools (5 tools)

**Files:**
- Create: `src/tools/get-eu-basis.ts`
- Create: `src/tools/get-dutch-implementations.ts`
- Create: `src/tools/search-eu-implementations.ts`
- Create: `src/tools/get-provision-eu-basis.ts`
- Create: `src/tools/validate-eu-compliance.ts`
- Create: `tests/tools/eu-cross-reference.test.ts`

Port all 5 EU tools from Swedish. Key changes:
- `get_swedish_implementations` → `get_dutch_implementations`
- `sfs_number` parameter → `document_id` (BWB-ID)
- `title_sv` → `title_nl`
- `SwedishImplementation` → `DutchImplementation`

All 5 tools share the same test file with sections per tool. Test against the EU sample data in the test fixture (GDPR, Directive 95/46, UAVG references).

**Step 1: Write failing tests for all 5 EU tools**
**Step 2: Run to verify fail**
**Step 3: Implement all 5 tools**
**Step 4: Run to verify all pass**
**Step 5: Commit**

```bash
git add src/tools/get-eu-basis.ts src/tools/get-dutch-implementations.ts \
  src/tools/search-eu-implementations.ts src/tools/get-provision-eu-basis.ts \
  src/tools/validate-eu-compliance.ts tests/tools/eu-cross-reference.test.ts
git commit -m "feat: add 5 EU law integration tools"
```

---

### Task 17: EU Reference Parser

**Files:**
- Create: `src/parsers/eu-reference-parser.ts`
- Create: `tests/parsers/eu-reference-parser.test.ts`

Extract EU references from Dutch statute text using regex. Key Dutch patterns:
- `Richtlijn (EU) 2019/770` → directive
- `Verordening (EU) 2016/679` → regulation
- `artikel 6.1.c` → article reference
- Classification keywords: `ter uitvoering van` → implements, `ter aanvulling van` → supplements, etc.

**Step 1: Write failing tests**

```typescript
describe('extractEUReferences', () => {
  it('should extract directive reference', () => {
    const text = 'ter uitvoering van Richtlijn (EU) 2019/770 van het Europees Parlement';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe('directive');
    expect(refs[0].year).toBe(2019);
    expect(refs[0].number).toBe(770);
    expect(refs[0].reference_type).toBe('implements');
  });

  it('should extract regulation with article', () => {
    const text = 'op grond van artikel 6.1.c van Verordening (EU) 2016/679';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe('regulation');
    expect(refs[0].article).toBe('6.1.c');
  });

  it('should extract old EG reference', () => {
    const text = 'Richtlijn 95/46/EG';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].community).toBe('EG');
  });
});
```

**Step 2-5: TDD cycle + commit**

```bash
git commit -m "feat: add Dutch EU reference parser"
```

---

### Task 18: BWB XML Parser

**Files:**
- Create: `src/parsers/bwb-xml-parser.ts`
- Create: `tests/parsers/bwb-xml-parser.test.ts`

Parse wetten.overheid.nl toestand XML into structured provisions. Uses `fast-xml-parser` (devDependency).

Handles the BWB XML hierarchy:
```
wet-besluit > wettekst > boek > titeldeel > afdeling > paragraaf > artikel > lid > al
```

Export: `parseBwbXml(xml: string): ParsedStatute`

Test with sample XML snippets embedded in the test file.

**Step 1-5: TDD cycle + commit**

```bash
git commit -m "feat: add BWB XML parser for wetten.overheid.nl"
```

---

### Task 19: MCP Server Entry Point

**Files:**
- Modify: `src/index.ts`

**Step 1: Implement the full MCP server**

Port from `../Swedish-law-mcp/src/index.ts`. Key changes:
- Server name: `dutch-legal-citations`
- DB env var: `DUTCH_LAW_DB_PATH`
- Default DB path: `../data/database.db`
- Import all 13 Dutch tools
- Tool definitions with Dutch-specific descriptions:
  - Replace "Swedish" → "Dutch", "SFS" → "BWB-ID", "kap." → "Art."
  - Update examples: "2018:218" → "BWBR0005289", "1 kap. 1 §" → "Art. 6:162 BW"
  - `get_swedish_implementations` → `get_dutch_implementations`
  - Court codes: "HR", "RVS" instead of "HD", "HFD"
  - Citation formats: Dutch examples
- Resource: `case-law-stats://dutch-law-mcp/metadata` with rechtspraak.nl attribution
- Import from `@ansvar/mcp-sqlite` (NOT `better-sqlite3`)

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point with all 13 tools"
```

---

### Task 20: Ingestion Scripts

**Files:**
- Create: `scripts/build-db.ts`
- Create: `scripts/ingest-bwb.ts`
- Create: `scripts/ingest-rechtspraak.ts`
- Create: `scripts/ingest-preparatory-works.ts`
- Create: `scripts/check-updates.ts`
- Create: `scripts/audit-seeds.ts`
- Create: `scripts/extract-definitions.ts`
- Create: `scripts/fetch-eurlex-metadata.ts`
- Create: `scripts/import-eurlex-documents.ts`

**Step 1: Implement build-db.ts**

Reads all `data/seed/*.json` files, creates the full schema, inserts data in a transaction.
Uses `@ansvar/mcp-sqlite` for database creation.

**Step 2: Implement ingest-bwb.ts**

SRU discovery → XML fetch → parse → seed JSON pipeline.
- Query: `https://zoekservice.overheid.nl/sru/Search?operation=searchRetrieve&version=1.2&x-connection=BWB&query=dcterms.type=wet`
- Paginate through all results (50 per page)
- For each BWB-ID, fetch XML from repository
- Parse with `bwb-xml-parser.ts`
- Save to `data/seed/{BWB-ID}.json`
- Rate limit: 500ms between requests

**Step 3: Implement ingest-rechtspraak.ts**

- Query: `https://data.rechtspraak.nl/uitspraken/zoeken?max=1000&return=DOC&sort=DESC`
- Parse XML response (DocBook-derived)
- Extract: ECLI, court, decision_date, summary, keywords, legal_domain
- Save to seed files
- Rate limit: 100ms between requests (10/s max)

**Step 4: Implement remaining scripts**

Stub implementations for: `ingest-preparatory-works.ts`, `check-updates.ts`, `audit-seeds.ts`, `extract-definitions.ts`, `fetch-eurlex-metadata.ts`, `import-eurlex-documents.ts`

**Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: add data ingestion scripts (BWB, rechtspraak, EUR-Lex)"
```

---

### Task 21: GitHub Actions & Documentation

**Files:**
- Create: `.github/workflows/check-updates.yml`
- Create: `smithery.yaml`
- Create: `README.md`

**Step 1: Create check-updates workflow**

Daily cron job that runs `npm run check-updates` and creates an issue with findings.

**Step 2: Create smithery.yaml**

MCP server configuration for Claude Desktop.

**Step 3: Create README.md**

Document: installation, tool list, data sources, citation formats, development setup.

**Step 4: Commit**

```bash
git add .github/ smithery.yaml README.md
git commit -m "feat: add GitHub Actions, Smithery config, and README"
```

---

### Task 22: Full Test Suite Verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Run with coverage**

Run: `npx vitest run --coverage`
Expected: >80% coverage on src/ files (excluding index.ts)

**Step 3: Build**

Run: `npm run build`
Expected: Clean compilation, dist/ populated

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final test suite verification"
```

---

## Task Summary

| Task | Description | Est. Files |
|------|------------|------------|
| 1 | Project scaffolding | 4 |
| 2 | Type definitions | 5 |
| 3 | Utility functions | 3 |
| 4 | Test database fixture | 2 |
| 5 | Citation parser | 2 |
| 6 | Citation formatter | 2 |
| 7 | Citation validator | 2 |
| 8 | search_legislation tool | 2 |
| 9 | get_provision tool | 2 |
| 10 | search_case_law tool | 2 |
| 11 | get_preparatory_works tool | 2 |
| 12 | validate_citation tool | 2 |
| 13 | build_legal_stance tool | 2 |
| 14 | format_citation tool | 2 |
| 15 | check_currency tool | 2 |
| 16 | EU tools (5) | 6 |
| 17 | EU reference parser | 2 |
| 18 | BWB XML parser | 2 |
| 19 | MCP server entry point | 1 |
| 20 | Ingestion scripts | 9 |
| 21 | GitHub Actions & docs | 3 |
| 22 | Full test verification | 0 |

**Total: ~57 files, 22 tasks**

## Dependencies Between Tasks

```
Task 1 (scaffolding)
  └── Task 2 (types)
       ├── Task 3 (utils)
       │    └── Tasks 8-16 (all tools)
       ├── Task 4 (test fixture)
       │    └── Tasks 5-16 (all tests)
       └── Task 5 (citation parser)
            ├── Task 6 (formatter)
            ├── Task 7 (validator)
            └── Task 12 (validate_citation tool)

Tasks 8-16 (tools) → Task 19 (index.ts)
Task 18 (BWB parser) → Task 20 (ingestion scripts)
Task 19 (server) → Task 21 (docs)
All → Task 22 (verification)
```

## Key Reference Files

When porting each tool, refer to the Swedish equivalent at `../Swedish-law-mcp/src/tools/`:
- `search-legislation.ts` → adapt query examples
- `get-provision.ts` → adapt provision_ref format (6:162 not 3:5)
- `search-case-law.ts` → adapt court codes, add ECLI
- `get-preparatory-works.ts` → adapt to kamerstukken
- `validate-citation.ts` → use Dutch parser
- `build-legal-stance.ts` → same structure
- `format-citation.ts` → Dutch formatting
- `check-currency.ts` → Dutch date patterns
- `get-eu-basis.ts` → rename sfs_number → document_id
- `get-swedish-implementations.ts` → get-dutch-implementations.ts
- `search-eu-implementations.ts` → same structure
- `get-provision-eu-basis.ts` → rename sfs_number → document_id
- `validate-eu-compliance.ts` → same structure
