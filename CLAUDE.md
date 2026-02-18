# CLAUDE.md

> Instructions for Claude Code when working on Dutch Law MCP

## Project Overview

This is an MCP server providing Dutch legal research tools — searching statutes, case law, preparatory works, and validating citations. Built with TypeScript and SQLite FTS5 for full-text search.

**Core principle: Verified data only** — the server NEVER generates citations, only returns data verified against authoritative Dutch legal sources (wetten.overheid.nl, rechtspraak.nl). All database entries are validated during ingestion.

**Data Sources:**

- wetten.overheid.nl — Official Basiswettenbestand (BWB) for Dutch statutes
- rechtspraak.nl — Open Data Rechtspraak for court decisions
- EUR-Lex — Official EU legislation database (metadata)

## Architecture

```
src/
├── index.ts                 # MCP server entry point (stdio transport)
├── types/
│   ├── index.ts             # Re-exports all types
│   ├── documents.ts         # Statute, DocumentType, DocumentStatus
│   ├── provisions.ts        # Provision, ProvisionRef, CrossReference
│   └── citations.ts         # ParsedCitation, CitationFormat, ValidationResult
├── citation/
│   ├── parser.ts            # Parse citation strings (Art. BW, ECLI, Kamerstukken, etc.)
│   ├── formatter.ts         # Format citations per Dutch conventions
│   └── validator.ts         # Validate citations against database
├── parsers/
│   ├── bwb-xml-parser.ts    # Parse BWB XML from wetten.overheid.nl
│   ├── eu-reference-parser.ts   # Extract EU directive/regulation references
│   ├── amendment-parser.ts      # Parse amendment metadata
│   └── cross-ref-extractor.ts   # Extract cross-references from text
├── tools/
│   ├── search-legislation.ts        # search_legislation - FTS5 provision search
│   ├── get-provision.ts             # get_provision - Retrieve specific provision
│   ├── search-case-law.ts           # search_case_law - FTS5 case law search
│   ├── get-preparatory-works.ts     # get_preparatory_works - Linked kamerstukken
│   ├── validate-citation.ts         # validate_citation - Zero-hallucination check
│   ├── build-legal-stance.ts        # build_legal_stance - Multi-source aggregation
│   ├── format-citation.ts           # format_citation - Citation formatting
│   ├── check-currency.ts            # check_currency - Is statute in force?
│   ├── get-eu-basis.ts              # get_eu_basis - EU law for Dutch statute
│   ├── get-dutch-implementations.ts # get_dutch_implementations - Dutch laws for EU act
│   ├── search-eu-implementations.ts # search_eu_implementations - Search EU documents
│   ├── get-provision-eu-basis.ts    # get_provision_eu_basis - EU basis for provision
│   ├── validate-eu-compliance.ts    # validate_eu_compliance - EU compliance check
│   ├── get-provision-at-date.ts     # get_provision_at_date - Historical versioning
│   └── list-sources.ts             # list_sources - Data provenance metadata
└── utils/
    ├── fts-query.ts         # FTS5 query builder
    ├── validate-input.ts    # Runtime input validation
    └── metadata.ts          # Metadata utilities

scripts/
├── build-db.ts              # Build SQLite database from seed files
├── ingest-bwb.ts            # Ingest statutes from wetten.overheid.nl
├── ingest-rechtspraak.ts    # Ingest case law from rechtspraak.nl
├── ingest-preparatory-works.ts  # Ingest kamerstukken
├── auto-ingest-all-statutes.ts  # Comprehensive statute ingestion
├── check-updates.ts         # Check for legal data updates
├── extract-definitions.ts   # Extract legal term definitions
├── populate-cross-references.ts # Build cross-reference links
├── populate-provision-versions.ts # Historical versioning
├── fetch-eurlex-metadata.ts     # Fetch EU metadata from EUR-Lex
├── import-eurlex-documents.ts   # Import EU documents
└── audit-seeds.ts           # Validate seed file integrity

tests/
├── fixtures/                # In-memory SQLite with sample Dutch law data
├── citation/                # Parser, formatter, validator tests
├── parsers/                 # BWB XML parser, EU reference parser tests
└── tools/                   # Tool-level integration tests

data/
├── seed/                    # JSON seed files per document
└── database.db              # SQLite database (~1GB)
```

## MCP Tools (15)

### Core Legal Research Tools (9)

| Tool                    | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| `search_legislation`    | FTS5 search on provision text with BM25 ranking                    |
| `get_provision`         | Retrieve specific provision by BWB-ID and article reference        |
| `search_case_law`       | FTS5 search on case law with court/date/domain filters             |
| `get_preparatory_works` | Get linked kamerstukken for a statute                              |
| `validate_citation`     | Validate citation against database (verification check)            |
| `build_legal_stance`    | Aggregate citations from statutes, case law, kamerstukken          |
| `format_citation`       | Format citations (full/short/pinpoint) per Dutch conventions       |
| `check_currency`        | Check if statute is in force (geldend recht), amended, or repealed |
| `list_sources`          | List authoritative data sources and provenance metadata            |

### EU Law Integration Tools (5)

| Tool                        | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `get_eu_basis`              | Get EU directives/regulations for Dutch statute      |
| `get_dutch_implementations` | Find Dutch laws implementing EU act                  |
| `search_eu_implementations` | Search EU documents with Dutch implementation counts |
| `get_provision_eu_basis`    | Get EU law references for specific provision         |
| `validate_eu_compliance`    | Check implementation status                          |

### Historical Versioning (1)

| Tool                    | Description                                  |
| ----------------------- | -------------------------------------------- |
| `get_provision_at_date` | Retrieve provision as it was at a given date |

## Dutch Law Structure

Dutch statutes follow this structure:

- **BWB-ID**: Unique identifier, e.g., "BWBR0005289" (Burgerlijk Wetboek)
- **Books** (Boeken): Major divisions in code-style statutes (BW has Books 1-10)
- **Titles** (Titels): Subdivisions within books
- **Sections** (Afdelingen): Subdivisions within titles
- **Articles** (Artikelen): Individual provisions, marked with "Art."
- **Paragraphs** (Leden): Within articles, numbered 1, 2, 3...

Citation formats:

- Statute articles: `Art. 6:162 BW`, `art. 287 Sr`, `art. 8:1 Awb`
- ECLI references: `ECLI:NL:HR:2019:376`
- Kamerstukken: `Kamerstukken II 2020/21, 35815, nr. 2`
- EU instruments: `Verordening (EU) 2016/679`, `Richtlijn 95/46/EG`

## Key Commands

```bash
# Development
npm run dev              # Run server with hot reload
npm run build            # Compile TypeScript
npm test                 # Run tests (vitest)
npm run test:coverage    # Tests with coverage

# Data Management
npm run ingest           # Ingest statutes from wetten.overheid.nl (BWB)
npm run ingest:all       # Comprehensive ingestion of ALL statutes
npm run ingest:cases     # Ingest case law from rechtspraak.nl
npm run ingest:prep-works # Ingest kamerstukken
npm run build:db         # Rebuild database from seed/
npm run check-updates    # Check for legal data updates

# Code Quality
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix lint errors
npm run format           # Prettier format
npm run format:check     # Check formatting

# Testing
npx @anthropic/mcp-inspector node dist/index.js
```

## Database Schema

```sql
-- Legal documents (statutes, AMvBs, ministerial regulations, kamerstukken, case law)
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,          -- BWB-ID (e.g., BWBR0005289)
  type TEXT NOT NULL,           -- statute|amvb|ministerial_regulation|kamerstuk|case_law
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,              -- e.g., "BW", "Sr", "Awb"
  status TEXT NOT NULL DEFAULT 'in_force',  -- in_force|amended|repealed|not_yet_in_force
  issued_date TEXT,
  in_force_date TEXT,
  url TEXT,
  description TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- Individual provisions (articles)
CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,  -- e.g., "6:162", "287"
  book TEXT,
  chapter TEXT,
  section TEXT,
  article TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,                -- JSON
  UNIQUE(document_id, provision_ref)
);

-- Historical provision versions (for get_provision_at_date)
CREATE TABLE legal_provision_versions (
  id INTEGER PRIMARY KEY,
  document_id TEXT,
  provision_ref TEXT,
  book TEXT, chapter TEXT, section TEXT,
  article TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  valid_from TEXT,
  valid_to TEXT
);

-- Court decisions
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

-- EU directives and regulations
CREATE TABLE eu_documents (
  id TEXT PRIMARY KEY,          -- "directive:2016/679" or "regulation:2016/679"
  type TEXT NOT NULL,           -- "directive" | "regulation"
  year INTEGER NOT NULL,
  number INTEGER NOT NULL,
  community TEXT,               -- "EU" | "EG" | "EEG"
  celex_number TEXT,
  title TEXT,
  title_en TEXT,
  short_name TEXT,              -- "GDPR", "AVG", etc.
  in_force BOOLEAN DEFAULT 1,
  adoption_date TEXT,
  url TEXT,
  UNIQUE(type, year, number)
);

-- Dutch -> EU cross-references
CREATE TABLE eu_references (
  id INTEGER PRIMARY KEY,
  statute_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_id INTEGER REFERENCES legal_provisions(id),
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
  eu_article TEXT,
  reference_type TEXT,          -- "implements", "supplements", "applies"
  is_primary_implementation BOOLEAN DEFAULT 0,
  context TEXT,
  UNIQUE(statute_id, provision_id, eu_document_id, eu_article)
);

-- FTS5 indexes (content-synced with triggers)
CREATE VIRTUAL TABLE provisions_fts USING fts5(..., tokenize='unicode61');
CREATE VIRTUAL TABLE provision_versions_fts USING fts5(..., tokenize='unicode61');
CREATE VIRTUAL TABLE case_law_fts USING fts5(..., tokenize='unicode61');
CREATE VIRTUAL TABLE prep_works_fts USING fts5(..., tokenize='unicode61');
CREATE VIRTUAL TABLE definitions_fts USING fts5(..., tokenize='unicode61');

-- Preparatory works, cross-references, definitions
-- See scripts/build-db.ts for full schema
```

## Testing

Tests use in-memory SQLite with sample Dutch law data:

```typescript
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('search_legislation', () => {
  let db: Database;
  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should find BW provisions', async () => {
    const result = await searchLegislation(db, { query: 'onrechtmatige daad' });
    expect(result.length).toBeGreaterThan(0);
  });
});
```

## Database Statistics (v1.0.0)

- **Statutes:** 3,248 (wetten, AMvBs, ministerial regulations)
- **Provisions:** 79,967 individual articles
- **Case Law:** 903,000+ court decisions (ECLI-indexed)
- **Kamerstukken:** 21,891 parliamentary documents
- **EU Documents:** 1,008 (500 directives, 487 regulations, 21 referenced)
- **Definitions:** 64 extracted legal terms
- **Database Size:** ~1 GB
- **MCP Tools:** 15 (9 core + 5 EU + 1 historical)

## Resources

- [wetten.overheid.nl](https://wetten.overheid.nl/) - Official Dutch statute database (BWB)
- [rechtspraak.nl](https://uitspraken.rechtspraak.nl/) - Open Data Rechtspraak
- [EUR-Lex](https://eur-lex.europa.eu/) - Official EU legislation
- [Overheid.nl](https://www.overheid.nl/) - Dutch government information

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a Pull Request.
- Branch protection requires: verified signatures, PR review, and status checks to pass.
- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, etc.
