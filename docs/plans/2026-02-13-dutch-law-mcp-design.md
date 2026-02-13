# Dutch Law MCP — Design Document

**Date**: 2026-02-13
**Approach**: Direct port of Swedish Law MCP with Dutch-specific adaptations
**Database**: `@ansvar/mcp-sqlite` ^1.0.0 (WASM, zero native modules, FTS5 included)

## Overview

Production-grade Dutch legal research MCP server. Zero hallucination — exclusively returns verified database entries from authoritative sources:

- **wetten.overheid.nl** (BWB — Basiswettenbestand) for all legislation
- **rechtspraak.nl** for case law (800,000+ published judgments)
- **EUR-Lex** for EU law cross-references
- **officielebekendmakingen.nl** for kamerstukken (legislative history)

All current Dutch legislation (~3,500+ statutes, AMvBs, ministerial regulations) in scope from day one. Full EU law integration included.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ES2022 + ESM modules) |
| MCP SDK | @modelcontextprotocol/sdk ^1.25.3 |
| Database | SQLite via @ansvar/mcp-sqlite ^1.0.0 (WASM, read-only mode) |
| Search | FTS5 with BM25 ranking, unicode61 tokenizer |
| Build | TypeScript compiler, Node.js >= 18 |
| Testing | Vitest with in-memory databases |
| Runtime | stdio transport for MCP communication |

## Project Structure

```
Dutch-law-mcp/
├── src/
│   ├── index.ts                          # MCP server entry point
│   ├── types/
│   │   ├── index.ts                      # Re-exports all types
│   │   ├── documents.ts                  # LegalDocument, DocumentStatus
│   │   ├── provisions.ts                 # LegalProvision, ProvisionRef
│   │   ├── citations.ts                  # ParsedCitation, ValidationResult
│   │   └── eu-references.ts              # EU directive/regulation types
│   ├── citation/
│   │   ├── parser.ts                     # Dutch citation parser
│   │   ├── formatter.ts                  # Dutch citation formatter
│   │   └── validator.ts                  # Citation validator
│   ├── parsers/
│   │   ├── provision-parser.ts           # Parse BWB XML -> provisions
│   │   ├── bwb-xml-parser.ts             # Parse wetten.overheid.nl XML structure
│   │   ├── amendment-parser.ts           # Parse amendment metadata
│   │   ├── cross-ref-extractor.ts        # Extract cross-references
│   │   └── eu-reference-parser.ts        # Extract EU references (Dutch keywords)
│   ├── tools/
│   │   ├── search-legislation.ts         # Tool 1: FTS5 provision search
│   │   ├── get-provision.ts              # Tool 2: Fetch specific artikel
│   │   ├── search-case-law.ts            # Tool 3: FTS5 case law search
│   │   ├── get-preparatory-works.ts      # Tool 4: Get kamerstukken/MvT links
│   │   ├── validate-citation.ts          # Tool 5: Validate Dutch citation
│   │   ├── build-legal-stance.ts         # Tool 6: Multi-source aggregation
│   │   ├── format-citation.ts            # Tool 7: Format per Dutch conventions
│   │   ├── check-currency.ts             # Tool 8: Check geldigheid (in-force status)
│   │   ├── get-eu-basis.ts               # Tool 9: EU directives for Dutch statute
│   │   ├── get-dutch-implementations.ts  # Tool 10: Dutch laws implementing EU act
│   │   ├── search-eu-implementations.ts  # Tool 11: Search EU documents
│   │   ├── get-provision-eu-basis.ts     # Tool 12: EU basis for specific artikel
│   │   └── validate-eu-compliance.ts     # Tool 13: EU compliance check
│   └── utils/
│       ├── fts-query.ts                  # FTS5 query builder
│       ├── as-of-date.ts                 # Date-aware lookups
│       └── metadata.ts                   # Response metadata generation
├── scripts/
│   ├── build-db.ts                       # Build database from seed JSON
│   ├── ingest-bwb.ts                     # Fetch statutes via SRU + repository
│   ├── ingest-rechtspraak.ts             # Fetch case law from rechtspraak.nl
│   ├── ingest-preparatory-works.ts       # Fetch kamerstukken
│   ├── extract-definitions.ts            # Extract legal definitions
│   ├── check-updates.ts                  # Check for amendments (GitHub Actions)
│   ├── audit-seeds.ts                    # Validate seed data integrity
│   ├── fetch-eurlex-metadata.ts          # Fetch EU document metadata
│   └── import-eurlex-documents.ts        # Import EU law references
├── tests/
│   ├── fixtures/test-db.ts               # In-memory test database with Dutch data
│   ├── citation/
│   │   ├── parser.test.ts
│   │   ├── formatter.test.ts
│   │   └── validator.test.ts
│   ├── parsers/
│   │   ├── bwb-xml-parser.test.ts
│   │   └── eu-reference-parser.test.ts
│   └── tools/
│       ├── search-legislation.test.ts
│       ├── get-provision.test.ts
│       ├── validate-citation.test.ts
│       ├── check-currency.test.ts
│       ├── get-preparatory-works.test.ts
│       ├── build-legal-stance.test.ts
│       └── eu-cross-reference.test.ts
├── data/
│   ├── seed/                             # JSON seed files per statute (BWB-ID.json)
│   └── database.db                       # Built SQLite database
├── docs/
│   └── plans/
├── .github/workflows/
│   ├── check-updates.yml                 # Daily data freshness check
│   └── security.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── smithery.yaml
└── README.md
```

## Database Schema

### Core Tables

```sql
-- All legal documents (statutes, AMvBs, ministerial regulations, kamerstukken, case law)
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,                    -- BWB-ID (BWBR0005289) or ECLI
  type TEXT NOT NULL
    CHECK(type IN ('statute', 'amvb', 'ministerial_regulation',
                   'kamerstuk', 'case_law')),
  title TEXT NOT NULL,                    -- Dutch title
  title_en TEXT,                          -- English translation
  short_name TEXT,                        -- e.g., "BW 6", "Sr", "Awb"
  status TEXT NOT NULL DEFAULT 'in_force'
    CHECK(status IN ('in_force', 'amended', 'repealed', 'not_yet_in_force')),
  issued_date TEXT,
  in_force_date TEXT,
  url TEXT,                               -- wetten.overheid.nl URL
  description TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- Individual provisions (artikelen)
CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,            -- e.g., "6:162" or "287"
  book TEXT,                              -- Boek number (for BW)
  chapter TEXT,                           -- Hoofdstuk
  section TEXT,                           -- Afdeling/Paragraaf
  article TEXT NOT NULL,                  -- Artikel number
  title TEXT,                             -- Article title if present
  content TEXT NOT NULL,                  -- Full article text
  metadata TEXT,                          -- JSON for leden, sub-articles
  UNIQUE(document_id, provision_ref)
);

CREATE INDEX idx_provisions_doc ON legal_provisions(document_id);
CREATE INDEX idx_provisions_book ON legal_provisions(document_id, book);
CREATE INDEX idx_provisions_chapter ON legal_provisions(document_id, chapter);

-- Historical versions for date-aware lookups (geldigheidsdatum)
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

CREATE INDEX idx_provision_versions_doc_ref
  ON legal_provision_versions(document_id, provision_ref);
CREATE INDEX idx_provision_versions_window
  ON legal_provision_versions(valid_from, valid_to);

-- FTS5 for provision search (content-synced with triggers)
CREATE VIRTUAL TABLE provisions_fts USING fts5(
  content, title,
  content='legal_provisions',
  content_rowid='id',
  tokenize='unicode61'
);

-- Automatic triggers to keep FTS index in sync
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

-- Case law metadata
CREATE TABLE case_law (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE REFERENCES legal_documents(id),
  court TEXT NOT NULL,                    -- e.g., "HR", "RVS", "RBAMS"
  ecli TEXT UNIQUE,                       -- ECLI:NL:HR:2024:472
  case_number TEXT,
  decision_date TEXT,
  procedure_type TEXT,                    -- e.g., "Cassatie", "Hoger beroep"
  legal_domain TEXT,                      -- e.g., "Civiel recht", "Strafrecht"
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

CREATE TRIGGER case_law_au AFTER UPDATE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, summary, keywords)
  VALUES ('delete', old.id, old.summary, old.keywords);
  INSERT INTO case_law_fts(rowid, summary, keywords)
  VALUES (new.id, new.summary, new.keywords);
END;

-- Preparatory works (kamerstukken / MvT)
CREATE TABLE preparatory_works (
  id INTEGER PRIMARY KEY,
  statute_id TEXT NOT NULL REFERENCES legal_documents(id),
  prep_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  kamerstuk_ref TEXT,                     -- e.g., "Kamerstukken II 2020/21, 35815, nr. 2"
  document_type TEXT,                     -- MvT, MvA, VV, NV, etc.
  title TEXT,
  summary TEXT
);

CREATE INDEX idx_prep_statute ON preparatory_works(statute_id);

-- Cross-references between provisions
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  source_provision_ref TEXT,
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,
  ref_type TEXT NOT NULL DEFAULT 'references'
    CHECK(ref_type IN ('references', 'amended_by', 'implements', 'see_also'))
);

-- Legal term definitions
CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  term TEXT NOT NULL,
  term_en TEXT,
  definition TEXT NOT NULL,
  source_provision TEXT,
  UNIQUE(document_id, term)
);
```

### EU Integration Tables

```sql
CREATE TABLE eu_documents (
  id TEXT PRIMARY KEY,                    -- e.g., "directive:2019/770"
  type TEXT NOT NULL CHECK (type IN ('directive', 'regulation', 'decision')),
  year INTEGER NOT NULL CHECK (year >= 1957 AND year <= 2100),
  number INTEGER NOT NULL CHECK (number > 0),
  community TEXT CHECK (community IN ('EU', 'EG', 'EEG', 'Euratom')),
  celex_number TEXT,
  title TEXT,
  title_nl TEXT,                          -- Dutch title
  short_name TEXT,                        -- e.g., "AVG" (GDPR in Dutch)
  adoption_date TEXT,
  entry_into_force_date TEXT,
  in_force BOOLEAN DEFAULT 1,
  amended_by TEXT,
  repeals TEXT,
  url_eur_lex TEXT,
  description TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_eu_documents_type_year ON eu_documents(type, year DESC);
CREATE INDEX idx_eu_documents_celex ON eu_documents(celex_number);

CREATE TABLE eu_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('provision', 'document', 'case_law')),
  source_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_id INTEGER REFERENCES legal_provisions(id),
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
  eu_article TEXT,
  reference_type TEXT NOT NULL CHECK (reference_type IN (
    'implements', 'supplements', 'applies', 'references', 'complies_with',
    'derogates_from', 'amended_by', 'repealed_by', 'cites_article'
  )),
  reference_context TEXT,
  full_citation TEXT,
  is_primary_implementation BOOLEAN DEFAULT 0,
  implementation_status TEXT CHECK (implementation_status IN (
    'complete', 'partial', 'pending', 'unknown'
  )),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_verified TEXT,
  UNIQUE(source_id, eu_document_id, eu_article)
);

CREATE INDEX idx_eu_references_document ON eu_references(document_id, eu_document_id);
CREATE INDEX idx_eu_references_eu_document ON eu_references(eu_document_id, document_id);
CREATE INDEX idx_eu_references_provision ON eu_references(provision_id, eu_document_id);
CREATE INDEX idx_eu_references_primary ON eu_references(eu_document_id, is_primary_implementation)
  WHERE is_primary_implementation = 1;

CREATE TABLE eu_reference_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eu_reference_id INTEGER NOT NULL REFERENCES eu_references(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INTEGER,
  UNIQUE(eu_reference_id, keyword)
);

CREATE TABLE case_law_sync_metadata (
  id INTEGER PRIMARY KEY,
  last_sync_date TEXT,
  last_decision_date TEXT,
  cases_count INTEGER,
  source TEXT                             -- "rechtspraak.nl"
);
```

## Data Ingestion Pipeline

### Architecture

```
Step 1: Discovery (SRU)
  zoekservice.overheid.nl/sru/Search?x-connection=BWB
  -> Query all active statutes, AMvBs, ministerial regulations
  -> Collect BWB-IDs (paginate, 50 per page)

Step 2: Fetch XML (Repository)
  repository.officiele-overheidspublicaties.nl/bwb/{BWB-ID}/
  -> Download toestand XML per BWB-ID (latest expression)
  -> Download WTI metadata per BWB-ID
  -> Rate limit: 0.5s between requests

Step 3: Parse XML (bwb-xml-parser.ts)
  -> Parse hierarchical structure:
     wet-besluit > wettekst > boek > titeldeel > afdeling > paragraaf > artikel > lid > al
  -> Extract: article number, title, content, leden
  -> Build provision_ref: "6:162" for Art. 6:162 BW
  -> Extract EU references from article text

Step 4: Generate Seed JSON
  -> One JSON file per statute/regulation
  -> data/seed/{BWB-ID}.json

Step 5: Build Database (build-db.ts)
  -> Read all seed JSON files
  -> Transaction: insert into all tables
  -> FTS5 triggers auto-populate search indexes
  -> Verify integrity
```

### Data Sources

| Source | URL | Purpose | Rate Limit |
|--------|-----|---------|------------|
| wetten.overheid.nl (SRU) | zoekservice.overheid.nl/sru/Search | Statute discovery | Not documented |
| wetten.overheid.nl (Repo) | repository.officiele-overheidspublicaties.nl | Statute XML | Open HTTPS |
| rechtspraak.nl | data.rechtspraak.nl/uitspraken | Case law | 10 req/s max |
| EUR-Lex | publications.europa.eu/webapi/rdf/sparql | EU law metadata | Open |
| Officielebekendmakingen | zoek.officielebekendmakingen.nl | Kamerstukken | Not documented |

### Seed File Format

```json
{
  "id": "BWBR0005289",
  "type": "statute",
  "title": "Burgerlijk Wetboek Boek 6",
  "title_en": "Civil Code Book 6",
  "short_name": "BW 6",
  "status": "in_force",
  "issued_date": "1992-01-01",
  "in_force_date": "1992-01-01",
  "url": "https://wetten.overheid.nl/BWBR0005289",
  "provisions": [
    {
      "provision_ref": "6:162",
      "book": "6",
      "chapter": null,
      "section": "9",
      "article": "162",
      "title": null,
      "content": "1. Hij die jegens een ander een onrechtmatige daad pleegt, welke hem kan worden toegerekend, is verplicht de schade die de ander dientengevolge lijdt, te vergoeden."
    }
  ],
  "preparatory_works": [],
  "eu_references": []
}
```

## MCP Tools (13)

### Core Research Tools

| # | Name | Input | Output |
|---|------|-------|--------|
| 1 | `search_legislation` | `query`, `document_id?`, `status?`, `as_of_date?`, `limit?` | Ranked provisions with snippets (FTS5 BM25) |
| 2 | `get_provision` | `document_id` (BWB-ID), `article_ref` (e.g., "6:162"), `as_of_date?` | Full provision text with metadata |
| 3 | `search_case_law` | `query`, `court?`, `date_from?`, `date_to?`, `legal_domain?`, `limit?` | Ranked case law with summaries |
| 4 | `get_preparatory_works` | `statute_id` (BWB-ID) | Linked kamerstukken, MvT, MvA documents |
| 5 | `validate_citation` | `citation` (string) | Parsed citation + database existence check |
| 6 | `build_legal_stance` | `query`, `as_of_date?`, `limit?` | Combined statutes + case law + kamerstukken results |
| 7 | `format_citation` | `document_id`, `provision_ref?`, `format?` | Formatted Dutch citation string |
| 8 | `check_currency` | `document_id`, `provision_ref?`, `as_of_date?` | In-force status, dates, warnings |

### EU Law Integration Tools

| # | Name | Input | Output |
|---|------|-------|--------|
| 9 | `get_eu_basis` | `document_id` (BWB-ID) | EU directives/regulations the statute implements |
| 10 | `get_dutch_implementations` | `eu_document_id`, `primary_only?`, `in_force_only?` | Dutch laws implementing the EU act |
| 11 | `search_eu_implementations` | `query`, `type?`, `year_from?`, `year_to?` | EU documents matching search |
| 12 | `get_provision_eu_basis` | `document_id`, `provision_ref` | EU article(s) referenced by specific provision |
| 13 | `validate_eu_compliance` | `document_id` | Compliance status against referenced EU acts |

## Dutch Citation Parser

### Supported Formats

```
Statute:        Art. 6:162 BW, art. 287 Sr, artikel 1 Gw, Art. 6:162 lid 2 BW
Case law:       ECLI:NL:HR:2024:472
Kamerstukken:   Kamerstukken II 2020/21, 35815, nr. 2
EU directive:   Richtlijn (EU) 2019/770, Richtlijn 95/46/EG
EU regulation:  Verordening (EU) 2016/679
```

### Regex Patterns

```typescript
// Statute: Art. 6:162 BW, art. 287 Sr
const STATUTE = /[Aa]rt(?:ikel)?\.?\s+(\d+(?::\d+\w*)?(?:\s+lid\s+\d+)?)\s+(BW|Sr|Sv|Awb|Gw|Fw|WvK|Rv|WOR|Wft|Wm|WVW)/;

// ECLI: ECLI:NL:HR:2024:472
const ECLI = /ECLI:NL:[A-Z]{2,5}:\d{4}:\d+/;

// Kamerstukken: Kamerstukken II 2020/21, 35815, nr. 2
const KAMERSTUKKEN = /Kamerstukken\s+(I{1,2})\s+\d{4}\/\d{2},\s+\d+(?:-\d+)?,\s+nr\.\s+\S+/;

// EU directive: Richtlijn (EU) 2019/770
const EU_DIRECTIVE = /[Rr]ichtlijn\s*\((?:EU|EG|EEG)\)\s*(?:nr\.\s*)?(\d{4}\/\d+)/;

// EU regulation: Verordening (EU) 2016/679
const EU_REGULATION = /[Vv]erordening\s*\((?:EU|EG|EEG)\)\s*(?:nr\.\s*)?(\d{4}\/\d+)/;
```

### Major Code Abbreviations

| Abbreviation | BWB-ID | Full Name |
|-------------|--------|-----------|
| BW 1-10 | BWBR0002656 etc. | Burgerlijk Wetboek |
| Sr | BWBR0001854 | Wetboek van Strafrecht |
| Sv | BWBR0001903 | Wetboek van Strafvordering |
| Awb | BWBR0005537 | Algemene wet bestuursrecht |
| Gw | BWBR0001840 | Grondwet |
| Fw | BWBR0001860 | Faillissementswet |
| Rv | BWBR0001827 | Wetboek van Burgerlijke Rechtsvordering |
| WvK | BWBR0001838 | Wetboek van Koophandel |
| Wft | BWBR0020368 | Wet op het financieel toezicht |
| Wm | BWBR0003245 | Wet milieubeheer |

### EU Reference Keywords (Dutch)

```typescript
const DUTCH_EU_KEYWORDS = {
  'ter uitvoering van': 'implements',
  'implementeert': 'implements',
  'ter implementatie van': 'implements',
  'aanvullende bepalingen bij': 'supplements',
  'ter aanvulling van': 'supplements',
  'zoals bedoeld in': 'applies',
  'in overeenstemming met': 'complies_with',
  'op grond van': 'cites_article',
  'bedoeld in artikel': 'cites_article',
};
```

## Testing Strategy

- **Framework**: Vitest with in-memory SQLite (`@ansvar/mcp-sqlite` with `:memory:`)
- **Test data**: BW 6:162 (tort), Sr 287 (homicide), Awb 8:1 (admin appeal), Gw 1 (equality), repealed statute, ECLI test cases, kamerstukken refs, EU references (AVG/GDPR)
- **Coverage**: v8 provider, exclude `src/index.ts` (integration tested)

## Deployment

```json
{
  "mcpServers": {
    "dutch-law": {
      "command": "node",
      "args": ["/path/to/dutch-law-mcp/dist/index.js"],
      "env": {
        "DUTCH_LAW_DB_PATH": "/path/to/dutch-law-mcp/data/database.db"
      }
    }
  }
}
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| @ansvar/mcp-sqlite over better-sqlite3 | Zero native modules, WASM, cross-platform, FTS5 included |
| Direct port of Swedish architecture | Proven with 717 statutes and 13 tools |
| SRU + XML repository pipeline | Only available API for wetten.overheid.nl |
| BWB-ID as primary key | Official stable identifier for Dutch legislation |
| ECLI for case law | EU-standardized, unique, used by all Dutch courts |
| unicode61 tokenizer | Handles Dutch characters (ij, e-acute, etc.) |
| Read-only database | Data integrity, safe in production |
| JSON seed files | Version-control friendly, human-readable |

## Limitations & Caveats

- NOT legal advice -- research tool only
- Case law coverage depends on rechtspraak.nl publication policy
- May lag amendments by 24-48 hours
- EU law metadata only (not full directive text)
- For confidential matters: use on-premise deployment
