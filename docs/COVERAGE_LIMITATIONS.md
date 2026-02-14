# Coverage and Limitations

## Introduction

The Dutch law MCP server provides comprehensive access to Dutch legal sources, including statutes, case law, preparatory works, and EU law integration. However, like any legal research system, it has inherent limitations based on data availability, processing scope, and design choices.

This document outlines what the server covers, where gaps exist, and what users should be aware of when conducting legal research.

**IMPORTANT**: This tool is for research purposes only and does not constitute legal advice. Always verify findings with official sources.

## 1. Statute Coverage

### Current Coverage

The Dutch law MCP server currently includes:
- **Major Dutch legal codes**: Burgerlijk Wetboek (BW), Wetboek van Strafrecht (Sr), Wetboek van Strafvordering (Sv), Algemene wet bestuursrecht (Awb), Grondwet (Gw)
- **Key modern statutes**: UAVG (GDPR Implementation Act), Algemene Plaatselijke Verordening (APV) templates, Telecommunicatiewet, Mededingingswet
- **Selected ministerial regulations and AMvBs** (Algemene Maatregelen van Bestuur)

### Gaps and Limitations

**Not all 4000+ Dutch statutes are ingested**:
- The Netherlands has thousands of active statutes and regulations
- The initial database includes a curated selection of major statutes
- Many sector-specific regulations, ministerial orders, and lower-level regulations are not yet included

**How to expand coverage**:
```bash
npm run ingest
```

This command:
- Fetches the complete statute list from wetten.overheid.nl
- Downloads XML files for all available statutes
- Parses and indexes the full corpus
- Updates the SQLite database

**Note**: Full ingestion may take several hours and requires significant disk space (~5-10 GB for XML files).

### AMvBs and Ministerial Regulations

**Partial coverage**:
- General measures of administration (AMvBs) are included where linked to parent statutes
- Ministerial regulations (*ministeriële regelingen*) have inconsistent coverage
- Local ordinances (*gemeentelijke verordeningen*) are generally not included

**Recommendation**: For comprehensive regulatory research, supplement with direct searches on wetten.overheid.nl.

### Historical and Repealed Statutes

**Limited coverage of repealed legislation**:
- The ingestion pipeline focuses on currently active statutes
- Repealed statutes may be available if historical versions are preserved in wetten.overheid.nl
- Use the `get_statute_versions` tool to check for historical versions

**Temporal limitations**:
- Versioning data depends on wetten.overheid.nl availability
- Some older statutes (pre-1995) may lack complete version history

## 2. Case Law Coverage

### Current Coverage

The Dutch law MCP server includes:
- **202,000+ court decisions** from rechtspraak.nl
- Coverage includes: Hoge Raad, Gerechtshoven, Rechtbanken, specialized courts (CRvB, CBb, etc.)
- Temporal range: Primarily 2000-present, with some older landmark cases

### Gaps and Limitations

#### Unpublished Decisions

**Major limitation**: Not all court decisions are published on rechtspraak.nl.

- Many lower court decisions, especially routine cases, are not published
- Publication criteria vary by court and case type
- Summary proceedings (*kort geding*) may have incomplete records
- Some sensitive cases (family law, national security) are redacted or unpublished

**Impact**: The case law database represents a substantial but incomplete sample of Dutch jurisprudence.

#### Temporal Coverage

**Pre-2000 decisions**:
- Limited digital archive availability
- Landmark cases from Hoge Raad may be available
- Lower court decisions are sparse or absent

**Recommendations**:
- For historical research, consult commercial databases (e.g., Kluwer Navigator, Rechtspraak.nl premium)
- Verify landmark cases with official reporters (*Nederlandse Jurisprudentie*, *Administratiefrechtelijke Beslissingen*)

#### Court Hierarchy Gaps

**Uneven coverage by court level**:
- Hoge Raad: Best coverage (nearly complete publication)
- Gerechtshoven: Good coverage (most important decisions published)
- Rechtbanken: Moderate coverage (selective publication)
- Kantonrechter: Limited coverage (rarely published)

#### CJEU and ECHR Case Law

**Not included**:
- Court of Justice of the European Union (CJEU) decisions
- European Court of Human Rights (ECtHR) decisions
- European Patent Office (EPO) decisions
- International arbitration awards

**Workaround**: For EU and ECHR case law, use dedicated databases (Curia, HUDOC) or commercial providers.

### Data Quality Issues

**Known issues**:
- Redactions: Parties, sensitive details, or entire decisions may be redacted
- Metadata gaps: Not all decisions include full metadata (ECLI, citations, etc.)
- Citation extraction: Automated citation parsing may miss non-standard formats

## 3. Preparatory Works (Kamerstukken)

### Current Coverage

The Dutch law MCP server includes preparatory works (parliamentary documents) linked to ingested statutes:
- Memorie van Toelichting (explanatory memoranda)
- Kamerstukadvies (committee reports)
- Nota van Wijziging (amendment notes)
- Verslag (parliamentary proceedings excerpts)

### Gaps and Limitations

#### Temporal Coverage

**Pre-1995 documents**:
- Digital archives are incomplete
- Many older kamerstukken are not available in structured format
- Hand-digitized documents may have OCR errors

**Recommendation**: For older legislation, consult physical archives or the Staten-Generaal Digitaal portal.

#### Linkage Quality

**Dependency on statute ingestion**:
- Preparatory works are linked to parent statutes
- If a statute is not ingested, its kamerstukken are also unavailable
- Some statutes may have incomplete kamerstukken linkage

#### Scope Limitations

**Not included**:
- Full parliamentary debates (Handelingen)
- Committee meetings (commissievergaderingen) transcripts
- Pre-legislative consultations (*internetconsultaties*)
- Advisory council opinions (Raad van State adviezen) – partial coverage

**Workaround**: For comprehensive legislative history research, use officielebekendmakingen.nl directly.

## 4. EU Law Integration

### Current Coverage

The Dutch law MCP server includes EU law integration features:
- 948 EU documents indexed (directives, regulations)
- Cross-references between Dutch statutes and EU instruments
- Implementation metadata and provision-level mappings

### Gaps and Limitations

#### Metadata Only, No Full Text

**Major limitation**: The server stores metadata about EU directives and regulations but not their full text.

**What IS included**:
- EU document identifiers (CELEX, EUR-Lex IDs)
- Titles and document types
- Implementation relationships with Dutch statutes

**What is NOT included**:
- Full text of directives and regulations
- EU preparatory works (COM documents)
- EU impact assessments

**Workaround**: For full EU legislation text, use EUR-Lex directly: https://eur-lex.europa.eu/

#### Extracted References May Be Incomplete

**Limitations of reference extraction**:
- References are extracted from Dutch statute text (preambles, footnotes, articles)
- Informal implementations (directives implemented without explicit citation) may be missed
- Indirect references (e.g., via AMvBs) are not always captured

**Recommendation**: Use the EU integration tools as a starting point, then verify with official implementation reports (EU Commission implementation databases).

#### No CJEU Case Law Integration

**Not included**:
- Court of Justice of the European Union (CJEU) preliminary rulings
- CJEU enforcement actions (infringement proceedings)
- CJEU opinions and orders

**Workaround**: For CJEU case law, use Curia: https://curia.europa.eu/

#### Limited Coverage of Recent Directives

**Lag in implementation data**:
- Newly adopted directives may not yet have Dutch implementations
- Implementation deadlines may not be reflected if transposition is pending
- The database requires periodic updates to capture new implementations

**Recommendation**: Run `npm run check-updates` regularly to monitor data currency.

## 5. Historical Versions

### Current Coverage

The Dutch law MCP server supports querying historical versions of statutes:
- Versions are retrieved from wetten.overheid.nl
- The `get_statute_versions` tool lists available versions
- The `get_statute_provision` tool accepts a `version_date` parameter for temporal queries

### Gaps and Limitations

#### Versioning Depends on Source Data Availability

**Limitations**:
- Historical versions are only available if wetten.overheid.nl has preserved them
- Some older statutes (pre-1995) may lack version history
- Not all provisions have granular version tracking (some versions are "as-of" snapshots only)

#### Temporal Query Limitations

**Challenges**:
- Querying "the law as of [date]" requires that a version exists near that date
- If no version exists for a requested date, the tool returns the closest available version
- Cross-referencing historical versions of multiple statutes is complex

**Example limitation**: If you query "BW Article 6:162 as of 2010-01-01" but the closest version is from 2009-07-15, the tool will return the 2009 version and note the discrepancy.

#### Repealed Provisions

**Partial coverage**:
- Repealed provisions may not be preserved if the entire statute was repealed
- Versioning data for repealed provisions is inconsistent

**Workaround**: For detailed historical research, consult legal historians or specialized archives.

## 6. Data Freshness

### Database is a Snapshot, Not Real-Time

**Important**: The Dutch law MCP server operates on a local SQLite database that is **not updated in real time**.

**Implications**:
- New statutes, court decisions, and EU directives are not automatically added
- Amendments to existing laws require re-ingestion to reflect changes
- Case law additions require running the case law ingestion script

### Updating the Database

**Manual update process**:

1. **Check for updates**:
   ```bash
   npm run check-updates
   ```
   This script checks wetten.overheid.nl and rechtspraak.nl for new content.

2. **Run ingestion**:
   ```bash
   npm run ingest
   ```
   This re-downloads and re-parses statutes, case law, and EU data.

3. **Rebuild database** (if schema changes):
   ```bash
   npm run build-db
   ```

**Recommended frequency**: At least monthly, or more frequently for active research projects.

### Data Lag

**Typical lag times**:
- **Statutes**: wetten.overheid.nl is updated within days of publication; your database reflects the last ingestion run
- **Case law**: rechtspraak.nl publishes decisions within weeks of issuance; your database reflects the last ingestion run
- **EU law**: EUR-Lex is updated daily; your database reflects the last ingestion run

**Critical for time-sensitive research**: Always verify the "last updated" date of your database and re-ingest if necessary.

## 7. Citation Parsing

### Current Capabilities

The Dutch law MCP server includes citation parsing for:
- Standard Dutch legal citation formats
- BWB identifiers (e.g., BWBR0011468)
- Rechtspraak ECLI identifiers (e.g., ECLI:NL:HR:2021:123)
- EU CELEX numbers (e.g., 32016R0679)

### Limitations

#### Non-Standard Citation Formats

**Challenges**:
- Abbreviated citations (e.g., "art. 6:162 BW") parse correctly
- Non-standard abbreviations may fail (e.g., "a. 162 B.W." instead of "art. 6:162 BW")
- Informal references (e.g., "the GDPR law") cannot be parsed without context

**Workaround**: Use the `search_statutes` tool to find the correct identifier, then query by BWB ID.

#### Complex Pinpoint Citations

**Limited support for**:
- Multi-level provisions: "art. 6:162 lid 2 sub a BW" (Article 6:162, paragraph 2, sub-clause a)
- Ranges: "art. 1-10 BW" (Articles 1 through 10)
- Conjunctive citations: "art. 6:162 en 6:163 BW" (Articles 6:162 and 6:163)

**Current behavior**: The parser extracts the primary provision reference (e.g., "6:162") but may ignore sub-clause or range details.

**Recommendation**: For complex provisions, query the top-level article, then manually inspect the returned text for the specific sub-clause.

#### Cross-Reference Ambiguity

**Example problem**: A Dutch statute refers to "art. 30", but doesn't specify *which* statute's Article 30.

**Limitation**: The citation parser requires context to resolve ambiguous references. If context is missing, the parser may return multiple matches or fail to resolve the reference.

**Workaround**: Use the `validate_citation_format` tool to check citation completeness, or provide additional context (e.g., statute title or BWB ID).

## 8. Not Legal Advice

### Critical Disclaimer

**This tool is for research purposes only and does not constitute legal advice.**

### Limitations of Automated Legal Research

1. **AI-generated results may contain errors or omissions**:
   - Natural language processing can misinterpret complex legal language
   - Citation extraction may miss context-dependent references
   - Summarization may oversimplify or mischaracterize legal rules

2. **Database limitations affect result quality**:
   - Missing statutes, cases, or EU documents limit completeness
   - Historical versions may be inaccurate or unavailable
   - Cross-references may be incomplete

3. **No legal interpretation or judgment**:
   - The server retrieves and formats legal sources but does not interpret them
   - Legal questions require human judgment, case analysis, and contextual understanding
   - Precedential value and applicability must be assessed by qualified legal professionals

### Best Practices for Users

**Always verify with official sources**:
- wetten.overheid.nl for statute text
- rechtspraak.nl for case law
- EUR-Lex for EU legislation
- officielebekendmakingen.nl for preparatory works

**Consult qualified legal professionals**:
- For legal advice, compliance questions, or case strategy
- For interpretation of ambiguous provisions or conflicting authorities
- For representation in legal proceedings

**Use the server as a research tool, not a legal oracle**:
- Cross-reference multiple sources
- Verify temporal validity (is this the current version?)
- Check for updates, amendments, and errata

## 9. Performance and Scalability Limitations

### Database Size

**Current size**: Approximately 500 MB - 2 GB (depending on ingestion scope)

**Performance implications**:
- SQLite performs well for databases up to several GB
- Very large queries (e.g., full-text search across all case law) may be slow
- Consider indexing optimization or upgrading to PostgreSQL for large-scale deployments

### Concurrent Access

**Single-user design**:
- The SQLite database supports concurrent reads but limited concurrent writes
- Not designed for multi-user server environments

**Recommendation**: For production deployments with multiple users, consider:
- Migrating to PostgreSQL or another client-server database
- Implementing caching layers (e.g., Redis)
- Deploying the MCP server behind a load balancer

### Ingestion Time

**Full ingestion duration**:
- Statutes: 2-4 hours (for all 4000+ statutes)
- Case law: 4-8 hours (for 202,000+ decisions)
- EU data: 30 minutes - 1 hour

**Recommendation**: Run ingestion scripts during off-hours or as scheduled batch jobs.

## 10. Language Limitations

### Dutch Language Focus

**Primary language**: The Dutch law MCP server is optimized for Dutch-language legal sources.

**Implications**:
- EU legislation metadata is in English, but Dutch implementations are in Dutch
- Case law is in Dutch (with some trilingual Benelux court decisions)
- Citation parsing assumes Dutch legal citation conventions

### Limited Multilingual Support

**Not supported**:
- Automatic translation of Dutch legal texts to other languages
- Cross-lingual search (e.g., searching Dutch case law with English keywords)

**Workaround**: Use external translation tools (e.g., DeepL, Google Translate) with caution, as legal terminology requires precision.

## 11. Future Enhancements

### Planned Improvements

The following enhancements are under consideration for future releases:

1. **Expanded case law coverage**: Integration with commercial databases (subject to licensing)
2. **CJEU and ECtHR case law**: Adding European court decisions
3. **Real-time updates**: Webhook-based ingestion for near-real-time data freshness
4. **Enhanced citation parsing**: Support for complex pinpoint citations and ranges
5. **Multilingual search**: Cross-lingual retrieval using embeddings or translation layers
6. **Preparatory works expansion**: Full parliamentary debates and committee transcripts
7. **Legal knowledge graphs**: Semantic relationships between statutes, cases, and EU law

### Community Contributions Welcome

The Dutch law MCP server is open-source. Contributions to improve coverage, parsing accuracy, or performance are welcome:
- GitHub repository: https://github.com/jeffreyvonrotz/Dutch-law-mcp
- Report issues or request features via GitHub Issues
- Submit pull requests with enhancements

## 12. Known Issues

### Active Limitations and Bugs

The following issues are known and being addressed:

1. **Citation extraction from case law**: Some court decisions cite statutes in non-standard formats, which the parser misses.
2. **EU reference extraction**: Implicit directive implementations (no explicit citation in statute text) are not detected.
3. **Provision versioning**: Not all provisions have granular version tracking; some versions are "as-of" snapshots only.
4. **AMvB linkage**: Some AMvBs are not properly linked to parent statutes due to incomplete metadata.

### Reporting New Issues

If you encounter a limitation or bug not listed here:
- Check the GitHub Issues page for existing reports
- Submit a new issue with:
  - Description of the problem
  - Steps to reproduce
  - Expected vs. actual behavior
  - Relevant document IDs or query examples

## Summary

The Dutch law MCP server is a powerful tool for legal research, but it has inherent limitations based on data availability, processing scope, and design choices. Users should:

- Understand the coverage boundaries (statutes, case law, EU law)
- Verify findings with official sources (wetten.overheid.nl, rechtspraak.nl, EUR-Lex)
- Update the database regularly to maintain data currency
- Use the tool as a research assistant, not a legal oracle
- Consult qualified legal professionals for legal advice and interpretation

**Remember**: This tool is for research purposes only. Always verify critical information and seek professional legal advice when needed.

---

**Last updated**: 2026-02-13
**Database version**: Check with `npm run check-updates`
**For support**: https://github.com/jeffreyvonrotz/Dutch-law-mcp/issues
