# Dutch Law MCP Server

**The Wetten.overheid.nl alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fdutch-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/dutch-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Dutch-law-mcp?style=social)](https://github.com/Ansvar-Systems/Dutch-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Dutch-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Dutch-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Dutch-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Dutch-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-77%2C531-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **3,251 Dutch statutes** -- from the AVG and Wetboek van Strafrecht to the Burgerlijk Wetboek, Mededingingswet, and the full BWB corpus -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Dutch legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Dutch legal research is scattered across Wetten.overheid.nl, Rechtspraak.nl, Kamerstukken, and EUR-Lex. Whether you're:

- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking AVG obligations or Mededingingswet requirements
- A **legal tech developer** building tools on Dutch law
- A **researcher** tracing legislative history from Kamerstukken to wet

...you shouldn't need dozens of browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Dutch law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://mcp.ansvar.eu/law-nl/mcp`

| Client             | How to Connect                                                               |
| ------------------ | ---------------------------------------------------------------------------- |
| **Claude.ai**      | Settings > Connectors > Add Integration > paste URL                          |
| **Claude Code**    | `claude mcp add dutch-law --transport http https://mcp.ansvar.eu/law-nl/mcp` |
| **Claude Desktop** | Add to config (see below)                                                    |
| **GitHub Copilot** | Add to VS Code settings (see below)                                          |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dutch-law": {
      "type": "url",
      "url": "https://mcp.ansvar.eu/law-nl/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "dutch-law": {
      "type": "http",
      "url": "https://mcp.ansvar.eu/law-nl/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/dutch-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "dutch-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/dutch-law-mcp"]
    }
  }
}
```

---

## Example Queries

Once connected, just ask naturally in Dutch or English:

- _"Wat zegt de AVG artikel 5 over de beginselen voor de verwerking van persoonsgegevens?"_
- _"Is de Mededingingswet artikel 24 over misbruik van machtspositie nog van kracht?"_
- _"Zoek bepalingen over gegevensbescherming in de Nederlandse wet"_
- _"Welke EU-richtlijnen implementeert de AVG?"_
- _"Valideer de citatie 'Wetboek van Strafrecht artikel 138b'"_
- _"Bouw een juridisch standpunt op over privacyrecht in Nederland"_
- _"What does Burgerlijk Wetboek Boek 6 say about contractual liability?"_
- _"Find provisions about trade secrets in Dutch law"_

---

## What's Included

| Category                       | Count           | Details                                                 |
| ------------------------------ | --------------- | ------------------------------------------------------- |
| **Statutes**                   | 3,251 laws      | Full BWB corpus from Wetten.overheid.nl (100% coverage) |
| **Provisions**                 | 77,531 sections | Full-text searchable with FTS5                          |
| **Premium: Case Law**          | 59,261 rulings  | Hoge Raad, Gerechtshoven, Rechtbanken decisions         |
| **Premium: Preparatory Works** | 2,994 documents | Kamerstukken, memorie van toelichting                   |
| **Database Size**              | 126 MB          | Optimized SQLite, portable                              |
| **Daily Updates**              | Automated       | Freshness checks against Wetten.overheid.nl             |

### Key Statutes Covered

| Statute                                                       | Subject                                          |
| ------------------------------------------------------------- | ------------------------------------------------ |
| Burgerlijk Wetboek (Boek 1–10)                                | Civil Code -- persons, property, contracts, tort |
| Wetboek van Strafrecht                                        | Criminal Code                                    |
| Algemene wet bestuursrecht                                    | General Administrative Law Act                   |
| Uitvoeringswet Algemene verordening gegevensbescherming (AVG) | GDPR implementation                              |
| Mededingingswet                                               | Competition Act                                  |
| Auteurswet                                                    | Copyright Act                                    |
| Arbeidsomstandighedenwet                                      | Working Conditions Act                           |
| Wet bescherming bedrijfsgeheimen                              | Trade Secrets Act                                |
| Telecommunicatiewet                                           | Telecommunications Act (ePrivacy)                |
| Wet op het financieel toezicht (Wft)                          | Financial Supervision Act                        |

**Verified data only** -- every citation is validated against official sources (Wetten.overheid.nl, Overheid.nl). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**

- All statute text is ingested from Wetten.overheid.nl official sources via the BWB API
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains regulation text, not AI interpretations

**Smart Context Management:**

- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by BWB identifier + chapter/article
- Cross-references help navigate without loading everything at once

**Technical Architecture:**

```
Wetten.overheid.nl BWB API → Parse → SQLite → FTS5 snippet() → MCP response
                                ↑                      ↑
                       Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach                               | This MCP Server                                        |
| -------------------------------------------------- | ------------------------------------------------------ |
| Search Wetten.overheid.nl by wet name              | Search by plain Dutch: _"persoonsgegevens verwerking"_ |
| Navigate multi-boek statutes manually              | Get the exact provision with context                   |
| Manual cross-referencing between wetten            | `build_legal_stance` aggregates across sources         |
| "Is this statute still in force?" → check manually | `check_currency` tool → answer in seconds              |
| Find EU basis → dig through EUR-Lex                | `get_eu_basis` → linked EU directives instantly        |
| Check Kamerstukken.nl separately                   | Premium `get_preparatory_works` → linked documents     |
| No API, no integration                             | MCP protocol → AI-native                               |

**Traditional:** Search Wetten.overheid.nl → Open BWB page → Navigate articles → Check Kamerstukken → EUR-Lex for EU basis → Repeat

**This MCP:** _"What EU law is the basis for AVG artikel 5 about data processing principles?"_ → Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool                    | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `search_legislation`    | FTS5 search on 77,531 provisions with BM25 ranking                |
| `get_provision`         | Retrieve specific provision by wet identifier + article number    |
| `search_case_law`       | FTS5 search on case law with court/date filters                   |
| `get_preparatory_works` | Get linked Kamerstukken and memorie van toelichting for a statute |
| `validate_citation`     | Validate citation against database (zero-hallucination check)     |
| `build_legal_stance`    | Aggregate citations from statutes, case law, prep works           |
| `format_citation`       | Format citations per Dutch conventions (full/short/pinpoint)      |
| `check_currency`        | Check if statute is in force, amended, or repealed                |

### EU Law Integration Tools (5)

| Tool                        | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| `get_eu_basis`              | Get EU directives/regulations that a Dutch statute implements |
| `get_dutch_implementations` | Find Dutch laws implementing a specific EU act                |
| `search_eu_implementations` | Search EU documents with Dutch implementation counts          |
| `get_provision_eu_basis`    | Get EU law references for a specific provision                |
| `validate_eu_compliance`    | Check implementation status (requires EU MCP)                 |

---

## EU Law Integration

Netherlands is a founding EU member state. Dutch law directly transposes EU directives across the full acquis communautaire.

| Metric                 | Value                                                         |
| ---------------------- | ------------------------------------------------------------- |
| **EU Member State**    | Yes (founding member, since 1958)                             |
| **GDPR Status**        | Directly applicable; implemented by Uitvoeringswet AVG        |
| **Key Implementation** | AVG → Uitvoeringswet Algemene verordening gegevensbescherming |
| **Competition Law**    | Mededingingswet implements EU Treaty Articles 101-102         |
| **ePrivacy**           | Telecommunicatiewet transposes ePrivacy Directive             |

### Dutch Law and EU Directives

- **AVG (GDPR)** -- GDPR is directly applicable in the Netherlands. The Uitvoeringswet AVG implements the member-state derogations and supplements. The `get_eu_basis` tool links AVG provisions to the underlying GDPR articles.
- **ePrivacy Directive** -- transposed via the Telecommunicatiewet, governing electronic communications and cookie consent.
- **Competition law** -- Mededingingswet aligns with EU Treaty Articles 101 (cartels) and 102 (abuse of dominance) and Commission enforcement practice.
- **Trade Secrets Directive** -- implemented by Wet bescherming bedrijfsgeheimen (2018).
- **Financial regulation** -- Wet op het financieel toezicht (Wft) transposes MiFID II, the Capital Requirements Directive, and related EU financial services directives.

The EU bridge tools provide bi-directional lookup: start from a Dutch provision to find its EU basis, or start from an EU directive to find its Dutch implementation.

See [EU_INTEGRATION_GUIDE.md](docs/EU_INTEGRATION_GUIDE.md) for detailed documentation.

---

## Premium Tier

The free tier includes all 77,531 provisions with full-text search and EU cross-references. The premium tier adds case law, preparatory works, and version history.

| Feature                             | Free | Premium |
| ----------------------------------- | ---- | ------- |
| Statute search (77,531 provisions)  | Yes  | Yes     |
| EU cross-references                 | Yes  | Yes     |
| Citation validation                 | Yes  | Yes     |
| Case law (59,261 rulings)           | --   | Yes     |
| Preparatory works (2,994 documents) | --   | Yes     |
| Provision version history           | --   | Yes     |
| Amendment diffs                     | --   | Yes     |

**Premium case law** covers decisions from the Hoge Raad (Supreme Court), Gerechtshoven (Courts of Appeal), and Rechtbanken (District Courts) sourced from Rechtspraak.nl.

**Premium preparatory works** covers Kamerstukken (parliamentary documents), memorie van toelichting (explanatory memoranda), and other preparatory materials from Overheid.nl.

Premium is enabled via `PREMIUM_ENABLED=true` environment variable. Contact [hello@ansvar.ai](mailto:hello@ansvar.ai) for access.

---

## Data Sources & Freshness

All content is sourced from authoritative Dutch legal databases:

- **[Wetten.overheid.nl](https://wetten.overheid.nl/)** -- Official consolidated statutes, Ministerie van Justitie en Veiligheid
- **[Rechtspraak.nl](https://www.rechtspraak.nl/)** -- Official court decisions database
- **[Overheid.nl](https://www.overheid.nl/)** -- Official government publications portal
- **[EUR-Lex](https://eur-lex.europa.eu/)** -- Official EU law database (metadata)

### Data Provenance

| Field                | Value                                               |
| -------------------- | --------------------------------------------------- |
| **Authority**        | Ministerie van Justitie en Veiligheid / Overheid.nl |
| **Retrieval method** | Bulk download from Wetten.overheid.nl BWB API       |
| **Language**         | Dutch (primary)                                     |
| **License**          | Open Government License -- Netherlands              |
| **Coverage**         | 3,251 Dutch federal laws (100% BWB corpus)          |
| **Last ingested**    | 2026-02-22                                          |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors all data sources:

| Source                     | Check                                         | Method                     |
| -------------------------- | --------------------------------------------- | -------------------------- |
| **Statute amendments**     | Wetten.overheid.nl date comparison            | All 3,251 statutes checked |
| **New statutes**           | BWB API publications (90-day window)          | Diffed against database    |
| **Case law**               | Rechtspraak.nl feed entry count               | Compared to database       |
| **Preparatory works**      | Overheid.nl Kamerstukken feed (30-day window) | New docs detected          |
| **EU reference staleness** | Git commit timestamps                         | Flagged if >90 days old    |

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner             | What It Does                                      | Schedule     |
| ------------------- | ------------------------------------------------- | ------------ |
| **CodeQL**          | Static analysis for security vulnerabilities      | Weekly + PRs |
| **Semgrep**         | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push   |
| **Gitleaks**        | Secret detection across git history               | Every push   |
| **Trivy**           | CVE scanning on filesystem and npm dependencies   | Daily        |
| **Docker Security** | Container image scanning + SBOM generation        | Daily        |
| **Socket.dev**      | Supply chain attack detection                     | PRs          |
| **OSSF Scorecard**  | OpenSSF best practices scoring                    | Weekly       |
| **Dependabot**      | Automated dependency updates                      | Weekly       |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official Wetten.overheid.nl publications. However:
>
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is limited** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources for court filings
> - **EU cross-references** are extracted from Dutch statute text and EUR-Lex metadata, not full EU law text
> - **Municipal and provincial legislation is not included** -- this covers national (rijks) legislation only

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters (including attorney-client privilege under the Wet op de rechtsbijstand), use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for guidance on use in Dutch legal practice.

---

## Documentation

- **[EU Integration Guide](docs/EU_INTEGRATION_GUIDE.md)** -- Detailed EU cross-reference documentation
- **[EU Usage Examples](docs/EU_USAGE_EXAMPLES.md)** -- Practical EU lookup examples
- **[Security Policy](SECURITY.md)** -- Vulnerability reporting and scanning details
- **[Disclaimer](DISCLAIMER.md)** -- Legal disclaimers and professional use notices
- **[Privacy](PRIVACY.md)** -- Client confidentiality and data handling

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Dutch-law-mcp
cd Dutch-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server (stdio)
npm run dev:http                                  # Start HTTP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                   # Ingest statutes from Wetten.overheid.nl BWB API
npm run ingest:all               # Full corpus ingest
npm run ingest:cases             # Ingest case law from Rechtspraak.nl
npm run ingest:prep-works        # Ingest Kamerstukken and preparatory works
npm run build:db                 # Rebuild free-tier SQLite database
npm run build:db:paid            # Rebuild premium SQLite database
npm run drift:detect             # Run drift detection against BWB anchors
npm run check-updates            # Check for statute amendments
npm run extract:definitions      # Extract legal definitions
npm run populate:xrefs           # Populate EU cross-references
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** 126 MB (efficient, portable)
- **Reliability:** 100% ingestion success rate

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)

**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/dutch-law-mcp (This Project)

**Query 3,251 Dutch statutes directly from Claude** -- AVG, BW, WvSr, Mededingingswet, Wft, and the full BWB corpus. Full provision text with EU cross-references. `npx @ansvar/dutch-law-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)

**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npm install @ansvar/us-regulations-mcp`

### [@ansvar/ot-security-mcp](https://github.com/Ansvar-Systems/ot-security-mcp)

**Query IEC 62443, NIST 800-82/53, and MITRE ATT&CK for ICS** -- Specialized for OT/ICS environments. `npx @ansvar/ot-security-mcp`

### [@ansvar/automotive-cybersecurity-mcp](https://github.com/Ansvar-Systems/Automotive-MCP)

**Query UNECE R155/R156 and ISO 21434** -- Automotive cybersecurity compliance. `npx @ansvar/automotive-cybersecurity-mcp`

### [@ansvar/sanctions-mcp](https://github.com/Ansvar-Systems/Sanctions-MCP)

**Offline-capable sanctions screening** -- OFAC, EU, UN sanctions lists. `pip install ansvar-sanctions-mcp`

**70+ national law MCPs** covering Australia, Belgium, Brazil, Canada, Denmark, Finland, France, Germany, Ireland, Italy, Japan, Norway, Poland, Singapore, South Korea, Sweden, Switzerland, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:

- Court case law expansion (Hoge Raad, Gerechtshoven archive)
- EU Regulations MCP integration (full EU law text, CJEU case law)
- Historical statute versions and amendment tracking
- Lower court decisions (Rechtbanken archives)
- English translations for key statutes

---

## Roadmap

- [x] **Core statute database** -- 3,251 Dutch statutes with FTS5 search (100% BWB coverage)
- [x] **EU law integration** -- cross-references to EU directives and regulations
- [x] **Premium case law** -- 59,261 Hoge Raad, Gerechtshoven, and Rechtbanken rulings
- [x] **Premium preparatory works** -- 2,994 Kamerstukken documents
- [x] **Hetzner GHCR deployment** -- Docker-based production hosting
- [x] **npm package publication**
- [x] **Full Wetten.overheid.nl coverage** -- 3,251 statutes, 77,531 provisions
- [ ] Historical statute versions (amendment tracking)
- [ ] Lower court coverage (Rechtbanken archives)
- [ ] Full EU text integration (via @ansvar/eu-regulations-mcp)
- [ ] English translations for key statutes
- [ ] Web API for programmatic access

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{dutch_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Dutch Law MCP Server: Production-Grade Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Dutch-law-mcp},
  note = {3,251 Dutch statutes with 77,531 provisions and EU law cross-references}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Ministerie van Justitie en Veiligheid ([Open Government License -- Netherlands](https://data.overheid.nl/en/open-government-licence-netherlands))
- **Case Law:** Rechtspraak.nl open data
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. This MCP server started as our internal reference tool for Dutch law -- turns out everyone building for the Dutch and EU market has the same research frustrations.

So we're open-sourcing it. Navigating 3,251 statutes and 77,531 provisions shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
