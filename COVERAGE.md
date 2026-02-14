# Data Coverage

> Comprehensive breakdown of Dutch legal data in this MCP server

## Overview

| Metric | Value | Notes |
|--------|-------|-------|
| **Statutes** | 3,248 | Wetten, AMvBs, ministerial regulations |
| **Provisions** | 79,967 | Individual statute articles |
| **Case Law** | 903,000+ | Court decisions from rechtspraak.nl |
| **Kamerstukken** | 21,891 | Parliamentary documents |
| **EU Documents** | 1,008 | 500 directives, 487 regulations, 21 referenced |
| **EU References** | 38 | Explicit Dutch-EU implementation links |
| **Definitions** | 64 | Extracted legal terms |
| **Database Size** | ~1 GB | SQLite with FTS5 indexes |
| **Last Major Update** | 2026-02-13 | Initial production release |

---

## Statute Coverage

### Overview

| Metric | Value |
|--------|-------|
| **Total Statutes** | 3,248 |
| **Total Provisions** | 79,967 |
| **Average Provisions/Statute** | 24.6 |

### Document Types

| Type | Description |
|------|-------------|
| **Wetten** | Primary legislation (Acts of Parliament) |
| **AMvBs** | Algemene Maatregelen van Bestuur (General Administrative Orders) |
| **Ministerial regulations** | Ministeriele regelingen |

### Key Statutes Included

| Statute | Short Name | BWB-ID | Description |
|---------|------------|--------|-------------|
| **Burgerlijk Wetboek** | BW | BWBR0005289 | Civil Code (Books 1-10) — 335 provisions |
| **Wetboek van Strafrecht** | Sr | BWBR0001854 | Criminal Code |
| **Algemene wet bestuursrecht** | Awb | BWBR0005537 | General Administrative Law Act |
| **Wetboek van Burgerlijke Rechtsvordering** | Rv | BWBR0001827 | Code of Civil Procedure |
| **Wetboek van Strafvordering** | Sv | BWBR0001903 | Code of Criminal Procedure |
| **Faillissementswet** | Fw | BWBR0001860 | Bankruptcy Act |
| And 3,242 more statutes | | | |

### By Domain Distribution

| Domain | Coverage | Key Laws |
|--------|----------|----------|
| **Civil Law** | Comprehensive | BW (Books 1-10), Rv |
| **Criminal Law** | Comprehensive | Sr, Sv |
| **Administrative Law** | Comprehensive | Awb, Wet openbaarheid van bestuur |
| **Tax Law** | Included | Wet inkomstenbelasting, AWR |
| **Labour Law** | Included | BW Boek 7, Arbeidstijdenwet |
| **Environmental Law** | Included | Wet milieubeheer, Omgevingswet |
| **Commercial Law** | Included | BW Boek 2, Handelsregisterwet |

---

## Case Law Coverage

### Current Status

| Metric | Value |
|--------|-------|
| **Total Decisions** | 903,000+ |
| **Source** | rechtspraak.nl (Open Data Rechtspraak) |
| **Identifier** | ECLI (European Case Law Identifier) |
| **Full-Text Search** | FTS5-indexed |
| **Batch Files** | 904 (1,000 decisions per batch) |

### Court Coverage

| Court | Dutch Name | Coverage |
|-------|------------|----------|
| **Supreme Court** | Hoge Raad | Included |
| **Courts of Appeal** | Gerechtshoven | Included |
| **District Courts** | Rechtbanken | Included |
| **Central Appeals Tribunal** | Centrale Raad van Beroep | Included |
| **Trade and Industry Appeals** | College van Beroep voor het bedrijfsleven | Included |
| **Council of State** | Raad van State (Afdeling bestuursrechtspraak) | Included |

### Case Law Features

- ECLI-indexed for European Case Law Identifier standard
- Full-text search with FTS5 and BM25 ranking
- Court and domain classification
- Date range filtering
- Source metadata linking to rechtspraak.nl

### Case Law Limitations

- Coverage depends on rechtspraak.nl open data availability
- Not all court decisions are published in open data (selective publication)
- Sensitive cases (family law, national security) may be redacted or unpublished
- Historical archive may be incomplete for older decisions
- No CJEU or ECtHR decisions

---

## Preparatory Works (Kamerstukken)

### Coverage

| Metric | Value |
|--------|-------|
| **Total Documents** | 21,891 |
| **Source** | officielebekendmakingen.nl |

### Types Included

| Type | Description |
|------|-------------|
| **Kamerstukken II** | Second Chamber (Tweede Kamer) documents |
| **Kamerstukken I** | First Chamber (Eerste Kamer) documents |
| **Voorstel van wet** | Bill proposals |
| **Memorie van toelichting** | Explanatory memoranda |
| **Nota van wijziging** | Amendment notes |

### Features

- Legislative intent research
- Historical context for policy discussions
- Multi-source aggregation with statutes and case law
- Verified data from official sources

### Limitations

- Summaries and metadata only — full kamerstuk text not always included
- Coverage may be incomplete for historical pre-2000 documents
- Full text requires visiting officielebekendmakingen.nl directly

---

## EU Cross-References

### Overview

| Metric | Value |
|--------|-------|
| **Total EU Documents** | 1,008 |
| **Directives** | 500 |
| **Regulations** | 487 |
| **Referenced Documents** | 21 (with specific Dutch links) |
| **Implementation Links** | 38 explicit Dutch-EU references |
| **CELEX Numbers** | Official EU identifiers for all documents |

### EU Law Features

- Bi-directional lookup — Find EU basis for Dutch law, and Dutch implementations of EU law
- Provision-level granularity where available
- CELEX numbers for official EUR-Lex references
- Community designation — Tracks EU, EG, EEG for historical directives
- Verified data only — All references extracted from verified statute text

### EU Law Limitations

- Metadata only — no full EU law text (requires @ansvar/eu-regulations-mcp)
- No CJEU case law — Court of Justice decisions not included
- Implementation gaps — Some EU directives may be implemented via AMvB, not statute
- No amendment tracking — EU directive amendments not automatically reflected
- SPARQL query limits cap directives and regulations at 500 each

---

## Legal Definitions

### Coverage

| Metric | Value |
|--------|-------|
| **Total Definitions** | 64 |
| **Source** | Extracted from statute text |

### Limitations

- Statute-based only — No case law or doctrinal definitions
- Pattern-based extraction — May miss non-standard definitions
- Dutch only — No English translations
- Limited to statutes processed during ingestion

---

## Data Quality

### Verification & Validation

| Aspect | Status | Method |
|--------|--------|--------|
| **Statute text** | High | BWB XML from wetten.overheid.nl |
| **Case law** | High | ECLI validation from rechtspraak.nl |
| **Citation formatting** | High | Parser validation against Dutch conventions |
| **Database integrity** | Full | SQLite constraints, FTS5 auto-sync |
| **Deduplication** | Full | UNIQUE constraints on all primary tables |

---

## Known Gaps & Future Coverage

### Priority Gaps

1. **Historical statute versions** — Amendment tracking across time
2. **Full kamerstuk text** — Currently metadata/summaries only
3. **More definitions** — Only 64 extracted so far
4. **English translations** — Key statutes in English
5. **CJEU case law** — EU Court of Justice decisions
6. **More EU implementation links** — Only 38 explicit links currently

### Planned Expansions

- [ ] Historical statute versions (amendment tracking)
- [ ] Expanded definitions extraction
- [ ] English translations for key statutes
- [ ] Full kamerstuk text
- [ ] Integration with EU Regulations MCP
- [ ] CJEU and ECtHR case law

---

## Coverage Comparison

### vs. Other Dutch Legal Databases

| Feature | This MCP | Kluwer Navigator | Sdu Opmaat | Legal Intelligence |
|---------|----------|------------------|------------|-------------------|
| **Statutes** | 3,248 | All (~4,000+) | All | All |
| **Provisions** | 79,967 | All | All | All |
| **Case law** | 903,000+ | All courts | All courts | All courts |
| **Kamerstukken** | 21,891 (metadata) | Full text | Full text | Full text |
| **EU cross-refs** | 1,008 (metadata) | Full text | Full text | Full text |
| **Free/Open** | Yes | No | No | No |
| **MCP/AI access** | Yes | No | No | No |
| **Verified data only** | Yes | N/A | N/A | N/A |

**Key Advantage:** Verified-data AI-powered search, completely free and open-source.

---

## Contact

For coverage questions or data quality issues:
- **Issues:** [GitHub Issues](https://github.com/Ansvar-Systems/Dutch-law-mcp/issues)
- **Email:** contact@ansvar.ai

---

<p align="center">
  <sub>Last updated: 2026-02-14</sub>
</p>
