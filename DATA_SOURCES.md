# Data Sources and Authority

This document details the provenance, authority level, and reliability of legal data in this Tool.

---

## Source Hierarchy

### 1. Official Government Sources (Highest Authority)

#### wetten.overheid.nl (BWB - Basiswettenbestand)

**URL**: https://wetten.overheid.nl/

**Authority Level**: ⭐⭐⭐⭐⭐ **Official / Authoritative**

**What It Is:**
- Official Dutch statute database maintained by the Ministerie van Binnenlandse Zaken en Koninkrijksrelaties
- Primary source for all Dutch legislation (wetten and regelingen)
- Part of the official overheid.nl government portal
- BWB (Basiswettenbestand) is the authoritative consolidated statute database

**Used For:**
- Statute full text (Burgerlijk Wetboek, Wetboek van Strafrecht, etc.)
- BWB-IDs and official metadata
- Issue dates and in-force dates
- Document structure (books, titles, chapters, articles)
- Official consolidated versions

**Reliability:**
- **High**: Official government publication
- **Currency**: Updated when statutes are published in Staatsblad
- **Completeness**: Comprehensive coverage of all Dutch legislation
- **Accuracy**: Authoritative legal text

**Limitations:**
- **Lag Time**: May not include today's publications (typically 24-48 hour delay)
- **Amendments**: Consolidated text may lag amendments slightly
- **No Annotations**: Plain statutory text without commentary or cross-references
- **XML Complexity**: BWB XML format requires specialized parsing

**Attribution**: Data from wetten.overheid.nl under Dutch Government Open Data policy.

---

#### rechtspraak.nl (Open Data Rechtspraak)

**URL**: https://uitspraken.rechtspraak.nl/

**Authority Level**: ⭐⭐⭐⭐⭐ **Official / Authoritative**

**What It Is:**
- Official publication platform for Dutch court decisions
- Maintained by de Rechtspraak (Dutch judiciary)
- Part of Open Data Rechtspraak initiative
- Uses European Case Law Identifier (ECLI) standard

**Used For:**
- Court decisions (uitspraken) from all Dutch courts
- ECLI identifiers (e.g., ECLI:NL:HR:2019:376)
- Decision metadata (court, date, case type, legal domain)
- Full-text decision content
- Precedent identification

**Reliability:**
- **High**: Official judiciary source
- **Currency**: Decisions published after anonymization and quality control
- **Completeness**: Comprehensive coverage of published decisions
- **Accuracy**: Authoritative court decisions

**Coverage:**
- **Hoge Raad** (Supreme Court) — Complete coverage
- **Gerechtshoven** (Courts of Appeal) — Complete coverage
- **Rechtbanken** (District Courts) — Selective publication
- **Centrale Raad van Beroep** — Administrative law appeals
- **College van Beroep voor het bedrijfsleven** — Business appeals
- **202,000+ decisions** currently in database

**Limitations:**
- **Not All Decisions Published**: Lower courts selectively publish
- **Anonymization Delay**: Privacy review may delay publication by weeks
- **Metadata Quality**: Some older decisions have incomplete metadata
- **No Annotations**: Plain decision text without editorial commentary

**Attribution**: Data from rechtspraak.nl under Dutch Government Open Data policy.

---

#### EUR-Lex (Official EU Legislation Database)

**URL**: https://eur-lex.europa.eu/

**Authority Level**: ⭐⭐⭐⭐⭐ **Official / Authoritative**

**What It Is:**
- Official EU legislation database
- Maintained by Publications Office of the European Union
- Authoritative source for EU directives, regulations, and case law
- CELEX numbering system for all EU documents

**Used For:**
- EU directive and regulation metadata
- CELEX identifiers (e.g., 32016R0679 for GDPR)
- Adoption dates and transposition deadlines
- Cross-references to Dutch implementing legislation

**Reliability:**
- **High**: Official EU publication
- **Currency**: Updated continuously
- **Completeness**: All EU legislation included
- **Accuracy**: Authoritative legal text

**This Tool's Coverage:**
- **948 EU documents** referenced in Dutch statutes
- Metadata only (titles, CELEX numbers, document types)
- Full directive/regulation text NOT included (available via EUR-Lex directly)
- Cross-references extracted from Dutch statute text

**Limitations:**
- ⚠️ **Metadata Only**: Full EU law text not in database
- ⚠️ **No CJEU Decisions**: Court of Justice case law not included
- ⚠️ **Implementation Coverage**: Not all Dutch implementations tracked

**Attribution**: EU document metadata from EUR-Lex and Dutch statute text (wetten.overheid.nl).

---

### 2. Commercial Legal Databases (Professional Standard)

This Tool does **NOT** include commercial database content, but professional users should cross-check with these authoritative sources:

#### Navigator (Wolters Kluwer)

**URL**: https://www.navigator.nl/

**Authority Level**: ⭐⭐⭐⭐⭐ **Editorially Verified / Professional Standard**

**What It Is:**
- Leading Dutch legal database (Wolters Kluwer)
- Editorially verified statute text and case law
- Annotations, commentary, and cross-references by legal experts
- Real-time updates and currency guarantees

**Why It's Better:**
- **Editorial Oversight**: Legal experts verify all content
- **Annotations**: Commentary explains application and interpretation
- **Cross-References**: Linked to parliamentary documents, case law, and doctrine
- **Currency SLA**: Guaranteed update timeframes
- **No Parsing Errors**: Direct feed from official sources

**Cost**: Subscription-based (€100-500/month per user)

---

#### Kluwer Navigator

**URL**: https://www.kluwer.nl/

**Authority Level**: ⭐⭐⭐⭐⭐ **Editorially Verified / Professional Standard**

**What It Is:**
- Comprehensive Dutch legal information system
- Integrated access to statutes, case law, and legal literature
- Similar features to Navigator (same publisher)

---

#### Sdu Wettenbundel

**URL**: https://www.sdu.nl/

**Authority Level**: ⭐⭐⭐⭐⭐ **Official Publisher / Professional Standard**

**What It Is:**
- Official publisher of Dutch legislation (Sdu Uitgevers)
- Authoritative printed and digital statute collections
- Used by courts and legal professionals
- Editorial annotations and commentary

---

## Data Quality Comparison

| Source | Authority | Currency | Annotations | Cost | Professional Use |
|--------|-----------|----------|-------------|------|------------------|
| **wetten.overheid.nl** | Official | High | None | Free | ✅ Statute text verification |
| **rechtspraak.nl** | Official | High | None | Free | ✅ Case law verification |
| **EUR-Lex** | Official (EU) | High | None | Free | ✅ EU law verification |
| **Navigator** | Professional | Very High | Expert | €€€ | ✅ Primary professional source |
| **Kluwer** | Professional | Very High | Expert | €€€ | ✅ Primary professional source |
| **This Tool** | Official data | Medium | None | Free | ⭐⭐⭐ Starting point — verify |

---

## How This Tool Uses Sources

### Statute Data Pipeline

```
wetten.overheid.nl (BWB XML) → Ingestion Script → JSON Seed Files → SQLite Database → MCP Tool
```

1. **Manual Ingestion**: `npm run ingest -- <BWB-ID>`
2. **XML Parsing**: Extract articles, chapters, metadata from BWB XML
3. **Storage**: Normalized in SQLite with FTS5 indexing
4. **Update Check**: `npm run check-updates` compares local vs. remote dates

**Frequency**: Manual (user-initiated) — NO automatic sync

**Lag Time**: Depends on when user last ran `npm run ingest`

**Current Coverage:**
- 12 major Dutch statutes
- Burgerlijk Wetboek (Books 1-10)
- Wetboek van Strafrecht
- Algemene wet bestuursrecht
- And 9 more

---

### Case Law Data Pipeline

```
rechtspraak.nl API → Ingestion Script → SQLite Database → MCP Tool
```

1. **Bulk Ingestion**: `npm run ingest:cases` fetches decisions from rechtspraak.nl
2. **ECLI Parsing**: Extract court, case number, decision date, legal domain
3. **FTS5 Indexing**: Full-text search on decision content
4. **Metadata Storage**: Court classification, date ranges, domain tags

**Frequency**: Manual (user-initiated) — recommended monthly

**Lag Time**:
- rechtspraak.nl may lag court decision by weeks (anonymization)
- This Tool may lag rechtspraak.nl by weeks/months (if user doesn't sync)

**Current Coverage:**
- 202,000+ published decisions
- All major Dutch courts
- ECLI-indexed for European standard

---

### EU Cross-Reference Pipeline

```
Dutch Statute Text → EU Reference Parser → EUR-Lex API → SQLite Database → MCP Tool
```

1. **Reference Extraction**: Automated parser scans Dutch statute text
2. **Pattern Recognition**: Identifies EU directives/regulations
3. **CELEX Generation**: Creates official EUR-Lex identifiers
4. **Metadata Fetching**: EUR-Lex API provides document metadata
5. **Validation**: CELEX format verification

**Frequency**: Manual (one-time per statute ingestion)

**Current Coverage:**
- 948 EU documents referenced in Dutch statutes
- Bi-directional lookup (Dutch → EU, EU → Dutch)
- Provision-level granularity

---

## Data Freshness Strategy

### Current Mechanism: Manual Updates

**Problem**: Data goes stale quickly
**Impact**: Professional users may rely on outdated law

**How to Update:**

```bash
# Check if statutes need updates
npm run check-updates

# Re-ingest updated statutes
npm run ingest -- BWBR0011823 data/seed/BWBR0011823.json

# Sync case law
npm run ingest:cases

# Rebuild database
npm run build:db
```

**Recommended Frequency:**
- **Statutes**: Monthly check via `npm run check-updates`
- **Case law**: Monthly sync via `npm run ingest:cases`
- **Emergency**: Immediately before critical legal work

---

### Proposed Automation (GitHub Actions)

**Automated Weekly Sync** (Implemented via GitHub Actions):

```yaml
name: Sync Legal Data
on:
  schedule:
    - cron: '0 2 * * 1'  # Every Monday at 2 AM UTC

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run check-updates
      - run: npm run ingest:cases
      - run: npm run build:db
      - uses: stefanzweifel/git-auto-commit-action@v4
        with:
          commit_message: 'chore: weekly legal data sync'
```

**Benefits:**
- Automatic weekly case law updates
- Statute staleness monitoring
- CI/CD database rebuilds
- Version-controlled data updates

---

## Attribution Requirements

### wetten.overheid.nl Data

Dutch government data published under **Open Data policy** (Public Sector Information Act).

**No Specific Attribution Required** by law, but recommended:
> Statute text from wetten.overheid.nl (Basiswettenbestand)

### rechtspraak.nl Data

Court decisions published under **Dutch Government Open Data policy**.

**Recommended Attribution:**
> Court decisions from rechtspraak.nl (Open Data Rechtspraak)

**In Tool Responses** (Already Implemented):
All case law results include `_metadata.source` and `_metadata.ecli` fields.

### EUR-Lex Data

EU legislation metadata under **EU Open Data policy**.

**Recommended Attribution:**
> EU legislation metadata from EUR-Lex (https://eur-lex.europa.eu/)

---

## Verification Workflow for Professional Use

### Recommended Process

1. **Initial Research**: Use this Tool for preliminary searches

2. **Official Verification**:
   ```
   Statute Text:   wetten.overheid.nl
   Case Law:       rechtspraak.nl
   EU Law:         eur-lex.europa.eu
   ```

3. **Professional Database Cross-Check**:
   ```
   Use Navigator/Kluwer for:
   - Editorial annotations
   - Cross-references to parliamentary documents
   - Commentary on application
   - Currency guarantees
   ```

4. **Document Sources**:
   - Cite official sources in legal work (not this Tool)
   - Keep audit trail of verification steps

---

## Source Authority Matrix

### When to Trust Each Source

| Legal Task | This Tool | wetten.overheid.nl | Navigator/Kluwer |
|------------|-----------|-------------------|------------------|
| **Quick lookup** | ✅ Fast | ✅ Official | ✅ Professional |
| **Preliminary research** | ✅ Good starting point | ✅ Authoritative | ✅ Comprehensive |
| **Cite in court filing** | ❌ Verify first | ✅ Acceptable | ✅ Professional standard |
| **Client advice** | ❌ Verify first | ⚠️ Verify currency | ✅ Safe |
| **Complex interpretation** | ❌ No annotations | ⚠️ No commentary | ✅ Expert commentary |
| **Historical research** | ❌ Limited versions | ⚠️ Limited | ✅ Historical versions |

---

## Transparency Commitments

### What We Disclose

1. **Source Provenance**: Every result indicates data source
2. **Currency Metadata**: Last-updated timestamps in responses
3. **Staleness Warnings**: Alerts when data >30 days old
4. **Coverage Gaps**: Explicit notice of missing sources
5. **Authority Levels**: Clear distinction between official and derivative sources

### What We Don't Track

- Individual user queries (not logged by this Tool)
- Query frequency or patterns
- User identity or organization
- Client matter details

**Privacy Note**: See [PRIVACY.md](PRIVACY.md) for full data handling details.

---

## Source Updates and Monitoring

### How to Check Data Currency

**Check Statute Currency:**
```bash
npm run check-updates
# Shows which BWB entries have remote updates
```

**Check Case Law Currency:**
```bash
npm run ingest:cases -- --check-only
# Shows available updates without downloading
```

**Check via Tool:**
Use `check_currency` tool — includes metadata in response:
```json
{
  "case_law_stats": {
    "last_updated": "2026-02-13T10:30:00Z",
    "total_cases": 202453,
    "source": "rechtspraak.nl"
  }
}
```

---

## Upstream Source Changes

### If wetten.overheid.nl API Changes

**Symptoms:**
- Ingestion scripts fail
- Empty or malformed data

**Mitigation:**
- Monitor [wetten.overheid.nl](https://wetten.overheid.nl/) status
- Check GitHub issues for breaking changes
- Update parsers in `src/parsers/bwb-xml-parser.ts`

### If rechtspraak.nl API Changes

**Symptoms:**
- Case law sync fails
- Missing case metadata

**Mitigation:**
- Monitor [rechtspraak.nl API docs](https://www.rechtspraak.nl/Uitspraken/paginas/open-data.aspx)
- Check for API version changes
- Update parsers in `scripts/ingest-cases.ts`

---

## Contributing Data Quality Improvements

### How to Report Data Issues

**Found an error?** Open a GitHub issue with:
1. **Provision/Case ID**: Specific BWB-ID or ECLI
2. **Expected**: What the official source says
3. **Actual**: What this Tool returns
4. **Source**: Link to official source showing correct data

**Label**: `data-quality`

### How to Contribute New Sources

Want to add additional legal sources (e.g., more statutes, treaties)?

1. **Propose Source**: Open GitHub discussion
2. **Verify License**: Ensure data is openly licensed or API terms allow use
3. **Implement Parser**: Follow existing patterns in `scripts/`
4. **Add Tests**: Include test data and coverage
5. **Document Authority**: Update this file with source authority analysis

---

## Summary: Source Trust Levels

**For Professional Legal Work:**

| Source | Use Case | Trust Level |
|--------|----------|-------------|
| **wetten.overheid.nl** | Statute text | ⭐⭐⭐⭐⭐ Fully trustworthy |
| **rechtspraak.nl** | Case law | ⭐⭐⭐⭐⭐ Fully trustworthy |
| **EUR-Lex** | EU legislation | ⭐⭐⭐⭐⭐ Fully trustworthy |
| **Navigator/Kluwer** | All legal research | ⭐⭐⭐⭐⭐ Professional standard |
| **This Tool** | Initial research | ⭐⭐⭐ Starting point — verify |

**Golden Rule**: Always verify with official or professional-grade sources before relying on data in legal work.

---

**Last Updated**: 2026-02-13
**Tool Version**: 1.0.0 (Production-Grade)
