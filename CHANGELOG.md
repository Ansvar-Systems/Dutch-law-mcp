# Changelog

All notable changes to the Dutch Law MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-02-13 - Initial Production Release

### Added

#### Core MCP Tools (13)
1. **`search_legislation`** — Full-text search across Dutch statutes with FTS5 indexing
2. **`get_provision`** — Retrieve specific provisions by BWB-ID and article reference
3. **`search_case_law`** — Search 202,000+ court decisions with court and domain filters
4. **`get_preparatory_works`** — Access kamerstukken (parliamentary documents) for statutes
5. **`validate_citation`** — Validate Dutch legal citations and verify database existence
6. **`build_legal_stance`** — Comprehensive research bundles combining multiple sources
7. **`format_citation`** — Format citations to standard Dutch legal citation conventions
8. **`check_currency`** — Verify whether statutes/provisions are currently in force
9. **`get_eu_basis`** — Find EU directives/regulations referenced in Dutch statutes
10. **`get_dutch_implementations`** — Find Dutch laws implementing EU instruments
11. **`search_eu_implementations`** — Search EU documents with Dutch implementation data
12. **`get_provision_eu_basis`** — Get EU references for specific statutory provisions
13. **`validate_eu_compliance`** — Check EU compliance for Dutch statutes/provisions

#### Data Coverage

**Dutch Statutes:**
- **3,248 statutes** including wetten, AMvBs, and ministerial regulations
- **79,967 provisions** (individual articles) with full-text search
- Key statutes include Burgerlijk Wetboek (Books 1-10), Wetboek van Strafrecht, Algemene wet bestuursrecht, Wetboek van Burgerlijke Rechtsvordering, and thousands more

**Court Decisions:**
- **903,000+ case law decisions** from rechtspraak.nl
- Coverage from all major Dutch courts:
  - Hoge Raad (Supreme Court)
  - Gerechtshoven (Courts of Appeal)
  - Rechtbanken (District Courts)
  - Centrale Raad van Beroep
  - College van Beroep voor het bedrijfsleven
- **ECLI-indexed** for European Case Law Identifier standard

**Parliamentary Documents:**
- **21,891 kamerstukken** (parliamentary documents)
- Linked to statutes for legislative history research

**EU Cross-References:**
- **1,008 EU documents** (500 directives, 487 regulations, 21 referenced)
- **38 explicit EU-Dutch implementation links**
- Bi-directional lookup (EU → Dutch, Dutch → EU)
- CELEX numbers for official EUR-Lex references
- Provision-level granularity for implementation tracking

**Definitions:**
- **64 legal term definitions** extracted from statute text

#### Parsers & Citation Support

**BWB XML Parser:**
- Parses official BWB XML from wetten.overheid.nl
- Extracts articles, chapters, titles, and metadata
- Handles complex nested structures
- Preserves legal formatting and numbering

**EU Reference Parser:**
- Extracts EU directives and regulations from Dutch legal text
- Parses article references (e.g., "artikel 6 lid 1 sub a")
- Detects implementation keywords
- Generates CELEX numbers

**Citation Parser:**
- Supports Dutch citation formats:
  - `Art. 6:162 BW`
  - `art. 287 Sr`
  - `ECLI:NL:HR:2019:376`
  - `Kamerstukken II 2020/21, 35815, nr. 2`
- Validates citation syntax
- Formats to standard conventions

#### Database Architecture

**SQLite with FTS5:**
- Full-text search on statutes, cases, and preparatory works
- Efficient indexing for fast queries (<100ms typical)
- Read-only runtime mode (security)
- Pre-built database included in package

**Tables:**
- `statutes` — Dutch statute metadata
- `provisions` — Individual articles and sections
- `case_law` — Court decisions with full text
- `preparatory_works` — Kamerstukken references
- `eu_documents` — EU directives and regulations
- `eu_references` — Links between Dutch and EU law
- `definitions` — Legal term definitions

#### Ingestion Scripts

**wetten.overheid.nl Integration:**
- `npm run ingest` — Fetch and parse BWB XML
- Automated metadata extraction
- Article-level indexing
- Version tracking

**rechtspraak.nl Integration:**
- `npm run ingest:cases` — Bulk case law ingestion
- ECLI parsing and validation
- Court and domain classification
- Full-text extraction

**EUR-Lex Integration:**
- `npm run fetch:eurlex` — Fetch EU metadata
- `npm run import:eurlex-documents` — Import to database
- CELEX number validation

#### Professional Use Documentation

**DISCLAIMER.md:**
- Legal disclaimers and professional liability notices
- Duty of independent verification
- Data authority and limitations
- Professional use warnings

**PRIVACY.md:**
- Client confidentiality considerations
- Nederlandse Orde van Advocaten compliance
- GDPR data processing obligations
- On-premise deployment guide

**SECURITY.md:**
- Security scanning (CodeQL, Semgrep, Trivy, Gitleaks)
- Vulnerability reporting process
- Database security model

**DATA_SOURCES.md:**
- Source authority hierarchy
- Data provenance and reliability
- Update mechanisms
- Attribution requirements

#### GitHub Actions Workflows

**CI/CD:**
- Automated testing on PRs
- Security scanning (CodeQL, Semgrep)
- Dependency vulnerability checks
- Build verification

**Smithery Integration:**
- Automated publishing to Smithery MCP registry
- Weekly data updates and sync
- Version management

### Data Quality

- **Verified data only:** All data from official government sources
- **903,000+ court decisions** with ECLI identifiers
- **3,248 statutes** with 79,967 provisions
- **21,891 kamerstukken** for legislative history
- **1,008 EU documents** with Dutch implementation links
- **Database size:** ~1GB
- **Search performance:** <100ms for most queries

### Data Sources & Attribution

**Official Sources:**
- **wetten.overheid.nl** — Dutch statute text (BWB)
- **rechtspraak.nl** — Court decisions (Open Data Rechtspraak)
- **EUR-Lex** — EU legislation metadata

All sources are official government/EU portals, used in accordance with open data policies.

---

## Version History Summary

| Version | Date | Key Changes |
|---------|------|-------------|
| **1.0.0** | 2026-02-13 | Initial production release (14 tools, 903K cases, 3,248 statutes, 1,008 EU docs) |

---

## Upgrade Notes

### Installing 1.0.0

**NPM Package:**
```bash
npm install @ansvar/dutch-law-mcp
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "dutch-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/dutch-law-mcp"]
    }
  }
}
```

**Features:**
- 14 MCP tools for Dutch legal research
- 903,000+ case law decisions
- 3,248 Dutch statutes with 79,967 provisions
- 21,891 kamerstukken
- 1,008 EU cross-references
- Full-text search with FTS5
- Citation parsing and validation

---

## Attribution

### Data Sources

#### Statutes
- **Source:** wetten.overheid.nl (Basiswettenbestand - BWB)
- **License:** Dutch Government Open Data policy
- **Access:** Official open data portal via SRU service
- **Coverage:** 3,248 statutes (wetten, AMvBs, ministerial regulations) with 79,967 provisions

#### Court Decisions
- **Source:** rechtspraak.nl (Open Data Rechtspraak)
- **License:** Dutch Government Open Data policy
- **Coverage:** 903,000+ decisions from all major Dutch courts
- **Attribution:** All case law results include source metadata

#### Parliamentary Documents
- **Source:** officielebekendmakingen.nl
- **License:** Dutch Government Open Data policy
- **Coverage:** 21,891 kamerstukken

#### EU Cross-References
- **Source:** Dutch statute text (wetten.overheid.nl) and EUR-Lex
- **Extraction:** Automated parser with validation
- **Validation:** CELEX number format verification
- **Coverage:** 1,008 EU documents (500 directives, 487 regulations, 21 referenced)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas for future contributions:
- Historical statute versions (amendment tracking)
- English translations for key statutes
- Integration with EU Regulations MCP
- Full kamerstuk text (currently metadata/summaries)
- Expanded legal definitions extraction

---

## License

Apache 2.0 - see [LICENSE](LICENSE)

Data licenses: Dutch Government Open Data policy, EU Open Data policy

---

**Maintained by:** [Ansvar Systems AB](https://ansvar.ai)
**Repository:** https://github.com/Ansvar-Systems/Dutch-law-mcp
**Support:** contact@ansvar.ai
