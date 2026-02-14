# EU Integration Guide

## Overview

The Dutch law MCP server includes powerful EU law integration capabilities, enabling you to explore the connections between Dutch national legislation and European Union law. This guide explains how to use the 5 EU integration tools to research directive implementations, regulatory compliance, and cross-border legal harmonization.

### Key Features

- **5 specialized EU integration tools** for querying EU-Dutch law relationships
- **Data sourced from EUR-Lex**, the official EU legislation database
- **Cross-references** between Dutch statutes and EU directives/regulations
- **Supports multiple identifier formats**: CELEX numbers, EUR-Lex URLs, and standard EU citation formats

The EU integration features are particularly valuable for:
- Compliance research and regulatory analysis
- Understanding the EU law basis for Dutch statutes
- Verifying implementation completeness
- Mapping provision-level relationships between EU and national law

## Available EU Tools

### 1. get_eu_basis

**Purpose**: Find which EU directives or regulations a Dutch statute is based on.

**Description**: This tool retrieves the EU legal instruments that serve as the basis for a given Dutch statute. It identifies directives that have been transposed into Dutch law and regulations that are directly implemented.

**Example Use Case**: Find what EU law the UAVG (Dutch GDPR Implementation Act) is based on.

**Input**:
```json
{
  "document_id": "BWBR0042124"
}
```

**Sample Response**:
```json
{
  "document_id": "BWBR0042124",
  "title": "Uitvoeringswet Algemene verordening gegevensbescherming",
  "eu_instruments": [
    {
      "eu_document_id": "regulation:2016/679",
      "celex": "32016R0679",
      "title": "General Data Protection Regulation (GDPR)",
      "type": "regulation",
      "relationship": "implements"
    }
  ]
}
```

**Common Applications**:
- Identifying the EU law foundation for Dutch legislation
- Understanding regulatory hierarchies
- Researching implementation timelines and obligations

---

### 2. get_dutch_implementations

**Purpose**: Find which Dutch laws implement a specific EU directive or regulation.

**Description**: This tool performs a reverse lookup, starting from an EU instrument and finding all Dutch statutes that implement or reference it. Essential for assessing implementation completeness and identifying relevant national legislation.

**Example Use Case**: Find all Dutch laws that implement the GDPR.

**Input**:
```json
{
  "eu_document_id": "regulation:2016/679"
}
```

**Sample Response**:
```json
{
  "eu_document_id": "regulation:2016/679",
  "title": "General Data Protection Regulation",
  "implementations": [
    {
      "document_id": "BWBR0042124",
      "title": "Uitvoeringswet Algemene verordening gegevensbescherming",
      "relationship": "implements",
      "implementation_date": "2018-05-25"
    },
    {
      "document_id": "BWBR0011468",
      "title": "Telecommunicatiewet",
      "relationship": "applies",
      "provisions": ["11.3", "11.3a"]
    }
  ]
}
```

**Common Applications**:
- Verifying implementation completeness
- Finding sector-specific implementations
- Comparative law research across member states

---

### 3. search_eu_implementations

**Purpose**: Search for EU instruments that have Dutch implementations, filtered by query and type.

**Description**: This tool enables free-text search across EU directives and regulations, returning only those with known Dutch implementation data. Useful for exploratory research when you don't know exact document identifiers.

**Example Use Case**: Search for privacy-related directives with Dutch implementations.

**Input**:
```json
{
  "query": "gegevensbescherming",
  "type": "directive"
}
```

**Sample Response**:
```json
{
  "results": [
    {
      "eu_document_id": "directive:95/46",
      "celex": "31995L0046",
      "title": "Data Protection Directive",
      "type": "directive",
      "implementation_count": 3,
      "relevance_score": 0.95
    },
    {
      "eu_document_id": "directive:2002/58",
      "celex": "32002L0058",
      "title": "ePrivacy Directive",
      "type": "directive",
      "implementation_count": 2,
      "relevance_score": 0.87
    }
  ]
}
```

**Search Tips**:
- Use Dutch keywords (e.g., "gegevensbescherming", "milieu", "consumenten")
- Filter by `type`: "directive", "regulation", or omit for both
- Results are ranked by relevance and implementation count

**Common Applications**:
- Topic-based research (environment, consumer protection, privacy, etc.)
- Discovering related EU instruments
- Building comprehensive directive implementation reports

---

### 4. get_provision_eu_basis

**Purpose**: Get EU legal basis references for a specific provision within a Dutch statute.

**Description**: This tool provides article-level or section-level granularity, showing which specific EU provisions correspond to a given Dutch statutory provision. Essential for detailed compliance analysis and provision-level mapping.

**Example Use Case**: Which EU article does Article 30 of the UAVG reference?

**Input**:
```json
{
  "document_id": "BWBR0042124",
  "provision_ref": "30"
}
```

**Sample Response**:
```json
{
  "document_id": "BWBR0042124",
  "provision_ref": "30",
  "provision_title": "Register van verwerkingsactiviteiten",
  "eu_references": [
    {
      "eu_document_id": "regulation:2016/679",
      "eu_provision": "30",
      "relationship": "implements",
      "note": "Records of processing activities"
    }
  ]
}
```

**Common Applications**:
- Mapping provision-level implementation
- Compliance auditing and gap analysis
- Understanding regulatory intent and context

---

### 5. validate_eu_compliance

**Purpose**: Check whether a Dutch statute properly implements the requirements of a specific EU directive or regulation.

**Description**: This tool performs a compliance check, comparing the provisions of a Dutch statute against the requirements of a specified EU instrument. It identifies missing implementations, derogations, and compliance gaps.

**Example Use Case**: Validate UAVG compliance with the GDPR.

**Input**:
```json
{
  "document_id": "BWBR0042124",
  "eu_document_id": "regulation:2016/679"
}
```

**Sample Response**:
```json
{
  "document_id": "BWBR0042124",
  "eu_document_id": "regulation:2016/679",
  "compliance_status": "compliant",
  "issues": [
    {
      "severity": "warning",
      "eu_provision": "23",
      "message": "Derogation from GDPR Article 23 (restrictions of rights)"
    }
  ],
  "coverage": {
    "implemented_provisions": 52,
    "total_relevant_provisions": 54,
    "coverage_percentage": 96.3
  }
}
```

**Compliance Statuses**:
- `compliant`: Full implementation detected
- `partial`: Some provisions implemented, gaps exist
- `non_compliant`: Significant implementation gaps or conflicts
- `unknown`: Insufficient data to determine compliance

**Common Applications**:
- Implementation gap analysis
- Infringement risk assessment
- Legislative drafting and review

## Common Research Workflows

### Workflow 1: Which EU law does this Dutch statute implement?

**Scenario**: You have a Dutch statute (e.g., BWBR0011468 - Telecommunicatiewet) and want to know its EU law foundation.

**Steps**:
1. Use `get_eu_basis` with the BWB document ID
2. Review the list of EU instruments returned
3. For deeper analysis, use `get_provision_eu_basis` on specific articles

**Example**:
```json
// Step 1: Get EU basis
{
  "tool": "get_eu_basis",
  "input": { "document_id": "BWBR0011468" }
}

// Step 2: Analyze specific provision
{
  "tool": "get_provision_eu_basis",
  "input": {
    "document_id": "BWBR0011468",
    "provision_ref": "11.3"
  }
}
```

---

### Workflow 2: Has the Netherlands fully implemented this directive?

**Scenario**: The EU has adopted a new directive (e.g., Digital Services Act), and you need to verify Dutch implementation.

**Steps**:
1. Use `get_dutch_implementations` with the EU document ID
2. Review the list of implementing statutes
3. Use `validate_eu_compliance` for each implementing statute
4. Check for implementation gaps or missing provisions

**Example**:
```json
// Step 1: Find implementations
{
  "tool": "get_dutch_implementations",
  "input": { "eu_document_id": "regulation:2022/2065" }
}

// Step 2: Validate compliance for each implementation
{
  "tool": "validate_eu_compliance",
  "input": {
    "document_id": "BWBR0XXXXX",
    "eu_document_id": "regulation:2022/2065"
  }
}
```

---

### Workflow 3: Check compliance of a specific provision

**Scenario**: You need to verify that Article 15 of a Dutch statute properly implements EU requirements.

**Steps**:
1. Use `get_provision_eu_basis` to identify the corresponding EU provision
2. Compare the Dutch provision text with EU requirements (using `get_statute_provision`)
3. Check for derogations or national discretion clauses

**Example**:
```json
// Step 1: Get EU reference
{
  "tool": "get_provision_eu_basis",
  "input": {
    "document_id": "BWBR0042124",
    "provision_ref": "15"
  }
}

// Step 2: Retrieve provision text
{
  "tool": "get_statute_provision",
  "input": {
    "document_id": "BWBR0042124",
    "provision_ref": "15"
  }
}
```

## EU Document ID Formats

The EU integration tools support multiple identifier formats for flexibility and interoperability.

### Standard Formats

**Directives**: `directive:YYYY/NNN`
- Example: `directive:95/46` (Data Protection Directive)
- Example: `directive:2002/58` (ePrivacy Directive)

**Regulations**: `regulation:YYYY/NNN`
- Example: `regulation:2016/679` (GDPR)
- Example: `regulation:2022/2065` (Digital Services Act)

### CELEX Numbers

CELEX (Communitatis Europeae Lex) is the official EU document numbering system.

**Format**: `3YYYYLNNNN` for directives, `3YYYYRNNNN` for regulations
- `3`: Indicates EU secondary legislation
- `YYYY`: Year of adoption
- `L`: Directive / `R`: Regulation
- `NNNN`: Sequential number (zero-padded)

**Examples**:
- `32016R0679` = GDPR (Regulation 2016/679)
- `31995L0046` = Data Protection Directive (Directive 95/46)
- `32002L0058` = ePrivacy Directive (Directive 2002/58)

### EUR-Lex URLs

The tools also accept full EUR-Lex URLs, which are automatically parsed:
- `https://eur-lex.europa.eu/eli/reg/2016/679/oj`
- `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679`

### Conversion Between Formats

| Standard Format | CELEX | Title |
|----------------|-------|-------|
| `directive:95/46` | `31995L0046` | Data Protection Directive |
| `regulation:2016/679` | `32016R0679` | GDPR |
| `directive:2002/58` | `32002L0058` | ePrivacy Directive |
| `regulation:2022/2065` | `32022R2065` | Digital Services Act |

## Data Coverage and Limitations

### Coverage Statistics

- **948 EU documents indexed** (as of last update)
- **Primary focus**: Directives and regulations with Dutch implementations
- **Geographic scope**: EU-wide instruments; no bilateral treaties
- **Temporal coverage**: EU legislation from 1958 onwards (Treaty of Rome)

### Data Scope

**What IS included**:
- EU directives with known Dutch implementations
- EU regulations directly applicable in the Netherlands
- Cross-reference metadata (which Dutch statute implements which EU instrument)
- Implementation dates and transposition deadlines
- Provision-level mappings (where available)

**What is NOT included**:
- Full text of EU legislation (metadata and references only)
- Court of Justice of the European Union (CJEU) case law
- European Court of Human Rights (ECtHR) case law
- EU Commission decisions and recommendations
- Bilateral treaties and international agreements outside EU framework
- Preparatory works (COM documents, legislative proposals)

### Data Quality and Sources

**Primary Sources**:
- EUR-Lex API for EU document metadata
- wetten.overheid.nl for Dutch statute text and references
- Parsed references extracted from Dutch statute preambles and notes

**Known Limitations**:
- **Metadata only**: The server does not store full-text EU legislation. For full text, use EUR-Lex directly.
- **Indirect references may be missed**: If a Dutch statute implements an EU directive without explicitly citing it, the relationship may not be captured.
- **No real-time updates**: The database is a snapshot. Run ingestion scripts periodically to update.
- **Implementation completeness**: Some informal or partial implementations may not be detected.

### Recommended Use Cases

**Well-suited for**:
- Finding the EU basis for a Dutch statute
- Identifying all Dutch laws implementing a directive
- Compliance gap analysis and auditing
- Cross-reference research and citation mapping

**Less suited for**:
- Full-text search within EU legislation (use EUR-Lex instead)
- CJEU case law research (use Curia or commercial databases)
- Detailed legislative history and preparatory works

## Reference Types

The EU integration tools use standardized `reference_type` values to describe the relationship between Dutch statutes and EU instruments.

### Core Reference Types

| Type | Description | Example |
|------|-------------|---------|
| `implements` | Dutch statute transposes or implements an EU directive | UAVG implements GDPR |
| `supplements` | Dutch statute adds national rules supplementing an EU regulation | National rules on GDPR enforcement |
| `applies` | Dutch statute applies or incorporates an EU regulation | Telecommunications law applying ePrivacy |
| `references` | Dutch statute references EU law without full implementation | Cross-reference for context |
| `complies_with` | Dutch statute is designed to comply with EU requirements | Sector-specific compliance |

### Amendment and Modification Types

| Type | Description | Example |
|------|-------------|---------|
| `derogates_from` | Dutch statute invokes a derogation or exception permitted by EU law | GDPR Article 23 restrictions |
| `amended_by` | Dutch statute has been amended to implement EU requirements | Implementation deadline amendments |
| `repealed_by` | Dutch statute has been repealed due to EU regulation taking precedence | Old data protection law repealed |

### Citation Types

| Type | Description | Example |
|------|-------------|---------|
| `cites_article` | Dutch provision cites a specific EU article or provision | Art. 30 UAVG cites Art. 30 GDPR |

### Interpreting Reference Types

**High Confidence** (primary relationships):
- `implements`, `supplements`, `applies`

**Medium Confidence** (supporting relationships):
- `complies_with`, `references`, `cites_article`

**Special Cases** (exceptions and modifications):
- `derogates_from`, `amended_by`, `repealed_by`

### Multi-Relationship Scenarios

A single Dutch statute may have multiple relationships with the same EU instrument:

```json
{
  "document_id": "BWBR0042124",
  "eu_references": [
    {
      "eu_document_id": "regulation:2016/679",
      "relationships": [
        "implements",
        "supplements",
        "derogates_from"
      ]
    }
  ]
}
```

This indicates that the Dutch statute implements the GDPR, adds supplementary national rules, and invokes permitted derogations.

## Tips and Best Practices

### Research Strategy

1. **Start broad, then narrow**: Use `search_eu_implementations` for exploratory research, then drill down with specific tools.
2. **Validate assumptions**: Always use `validate_eu_compliance` to check implementation completeness.
3. **Cross-reference provisions**: Use `get_provision_eu_basis` for detailed article-level analysis.
4. **Check multiple sources**: Verify findings with official EUR-Lex and wetten.overheid.nl sources.

### Troubleshooting

**Problem**: No results returned for a known EU directive.
- **Solution**: The directive may not have a Dutch implementation in the database. Try searching by topic with `search_eu_implementations`.

**Problem**: Compliance validation shows "unknown" status.
- **Solution**: Insufficient data for that EU instrument. Check EUR-Lex directly for detailed requirements.

**Problem**: Provision-level references are missing.
- **Solution**: Not all provisions have granular mapping data. Use `get_eu_basis` for document-level relationships.

### Performance Optimization

- Use specific document IDs when possible (faster than search)
- Cache results for frequently accessed directives/regulations
- Batch multiple queries when researching related instruments

## Further Resources

- **EUR-Lex**: https://eur-lex.europa.eu/
- **wetten.overheid.nl**: https://wetten.overheid.nl/
- **CELEX documentation**: https://eur-lex.europa.eu/content/tools/TableOfSectors/types_of_documents_in_eurlex.html
- **Dutch implementation tracker**: https://www.europadecentraal.nl/

## Support and Contributions

For issues, questions, or contributions to the EU integration features:
- GitHub repository: [Dutch-law-mcp](https://github.com/jeffreyvonrotz/Dutch-law-mcp)
- Report data quality issues or missing implementations via GitHub Issues
- Contributions to improve EU reference extraction are welcome

---

**Last updated**: 2026-02-13
**Database version**: Check with `npm run check-updates`
