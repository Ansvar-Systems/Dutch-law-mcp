# Dutch Law MCP Server

Production-grade [Model Context Protocol](https://modelcontextprotocol.io/) server for Dutch legal research. Provides AI assistants with structured access to 3,248 Dutch statutes, 903,000+ court decisions, 21,000+ kamerstukken, and 1,000+ EU cross-references.

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version — zero dependencies, nothing to install.

**Endpoint:** `https://dutch-law-mcp.vercel.app/mcp`

| Client             | How to Connect                                                                   |
| ------------------ | -------------------------------------------------------------------------------- |
| **Claude.ai**      | Settings > Connectors > Add Integration > paste URL                              |
| **Claude Code**    | `claude mcp add dutch-law --transport http https://dutch-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below)                                                        |
| **GitHub Copilot** | Add to VS Code settings (see below)                                              |

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dutch-law": {
      "type": "url",
      "url": "https://dutch-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** — add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "dutch-law": {
      "type": "http",
      "url": "https://dutch-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/dutch-law-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

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

## Available Tools

| Tool                        | Description                                                                       |
| --------------------------- | --------------------------------------------------------------------------------- |
| `search_legislation`        | Full-text search across Dutch statutes and regulations (FTS5-indexed)             |
| `get_provision`             | Retrieve a specific provision by BWB-ID, book, and article (e.g., Art. 6:162 BW)  |
| `search_case_law`           | Search Dutch court decisions with filters for court, legal domain, and date range |
| `get_preparatory_works`     | Get kamerstukken (parliamentary documents) for a statute                          |
| `validate_citation`         | Validate Dutch legal citations and check database existence                       |
| `build_legal_stance`        | Build comprehensive research bundles combining statutes, case law, and travaux    |
| `format_citation`           | Format citations to standard Dutch legal citation format                          |
| `check_currency`            | Check whether a statute or provision is currently in force (geldend recht)        |
| `get_eu_basis`              | Get EU legal basis (directives/regulations) for a Dutch statute                   |
| `get_dutch_implementations` | Find Dutch statutes implementing a given EU directive or regulation               |
| `search_eu_implementations` | Search EU instruments and their Dutch implementations                             |
| `get_provision_eu_basis`    | Get EU references for a specific provision                                        |
| `validate_eu_compliance`    | Validate EU compliance for a Dutch statute or provision                           |
| `get_provision_at_date`     | Retrieve a specific provision as it was at a given date (historical versioning)   |

## Data Sources

| Source                 | Description                                                          | URL                               |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------- |
| **wetten.overheid.nl** | Official BWB (Basiswettenbestand) for Dutch statutes and regulations | https://wetten.overheid.nl        |
| **rechtspraak.nl**     | Open data portal for Dutch court decisions                           | https://uitspraken.rechtspraak.nl |
| **EUR-Lex**            | Official EU legislation database                                     | https://eur-lex.europa.eu         |

All data is sourced from official open data portals and stored locally in a SQLite database for fast, offline-capable lookups.

## Data Coverage

| Metric           | Count                                          |
| ---------------- | ---------------------------------------------- |
| **Statutes**     | 3,248 (wetten, AMvBs, ministerial regulations) |
| **Provisions**   | 79,967 individual articles                     |
| **Case law**     | 903,000+ court decisions (ECLI-indexed)        |
| **Kamerstukken** | 21,891 parliamentary documents                 |
| **EU documents** | 1,008 directives and regulations               |
| **Definitions**  | 64 extracted legal terms                       |

## Supported Citation Formats

- **Statute articles**: `Art. 6:162 BW`, `art. 287 Sr`, `art. 8:1 Awb`
- **ECLI references**: `ECLI:NL:HR:2019:376`
- **Kamerstukken**: `Kamerstukken II 2020/21, 35815, nr. 2`
- **EU instruments**: `Verordening (EU) 2016/679`, `Richtlijn 95/46/EG`

## Development

### Branching Strategy

This repository uses a `dev` integration branch. **Do not push directly to `main`.**

```
feature-branch → PR to dev → verify on dev → PR to main → deploy
```

- `main` is production-ready. Only receives merges from `dev` via PR.
- `dev` is the integration branch. All changes land here first.
- Feature branches are created from `dev`.

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Dutch-law-mcp.git
cd Dutch-law-mcp
npm install
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

### Linting and Formatting

```bash
npm run lint           # Check for lint errors
npm run lint:fix       # Auto-fix lint errors
npm run format         # Format all files
npm run format:check   # Check formatting
```

Pre-commit hooks via Husky and lint-staged automatically run ESLint and Prettier on staged files.

### Ingestion Scripts

```bash
npm run ingest              # Ingest statutes from wetten.overheid.nl (BWB)
npm run ingest:all          # Comprehensive ingestion of ALL Dutch statutes
npm run ingest:cases        # Ingest case law from rechtspraak.nl
npm run ingest:prep-works   # Ingest kamerstukken (parliamentary documents)
npm run build:db            # Build the SQLite database from seed files
npm run audit:seeds         # Validate seed file schema compliance
npm run check-updates       # Check for legal data updates
npm run extract:definitions # Extract legal term definitions from statutes
npm run fetch:eurlex        # Fetch EU document metadata from EUR-Lex
npm run import:eurlex-documents  # Import EU law references into database
```

### Project Structure

```
src/
  index.ts              # MCP server entry point (stdio)
  http-server.ts        # HTTP server entry point (Streamable HTTP)
  tools/
    registry.ts         # Shared tool definitions and handler registration
    ...                 # 14 MCP tool implementations
  parsers/              # BWB XML parser, EU reference parser, amendment parser, cross-ref extractor
  citation/             # Citation parsing and formatting
  types/                # TypeScript type definitions
  utils/
    ensure-database.ts  # Download-on-first-run database management
    ...                 # Other shared utilities
scripts/                # Ingestion and build scripts
tests/                  # Vitest test suites
docs/                   # EU integration guide, coverage limitations
data/
  seed/                 # JSON seed files (one per statute/batch)
  database.db           # SQLite database (built from seeds)
```

## Docker

### Build and run (stdio mode, default)

```bash
docker build -t dutch-law-mcp .
docker run --rm -i dutch-law-mcp
```

### HTTP mode

```bash
docker run --rm -e MODE=http -p 3000:3000 dutch-law-mcp
```

Verify with:

```bash
curl http://localhost:3000/health
```

### Docker Compose

```bash
docker compose up -d
```

The Docker image uses a multi-stage build with a non-root user for security. The database is baked into the image at build time.

## Deployment

### Railway

```bash
railway init
railway up
```

Set environment variables:

- `MODE=http`
- `PORT` is set automatically by Railway

### Fly.io

```bash
fly launch
fly deploy
```

In `fly.toml`:

```toml
[env]
  MODE = "http"

[[services]]
  internal_port = 3000
```

### Vercel (Serverless)

Deploy as a serverless function — no long-running server needed:

```bash
npm i -g vercel    # Install Vercel CLI (once)
vercel deploy      # Deploy to preview
vercel --prod      # Deploy to production
```

The serverless handler at `api/mcp.ts` downloads the ~1 GB SQLite database from GitHub Releases on cold start, decompresses it to `/tmp`, and caches it across warm invocations. The WASM-based SQLite driver (`node-sqlite3-wasm`) works on Vercel without native compilation.

**Note:** Requires Vercel Pro plan (1 GB `/tmp` storage) and `maxDuration >= 60` for cold-start downloads. Override the download URL with `DUTCH_LAW_DB_URL` if needed.

| Endpoint  | Method | Description                              |
| --------- | ------ | ---------------------------------------- |
| `/health` | GET    | Health check (`{ "status": "ok" }`)      |
| `/mcp`    | GET    | Server metadata JSON                     |
| `/mcp`    | POST   | MCP protocol (stateless Streamable HTTP) |

## Releasing

To prepare a new release with the database artifact:

```bash
npm run prepare-release   # Creates data/database.db.gz
gh release create v1.0.0
gh release upload v1.0.0 data/database.db.gz
npm publish
```

The gzipped database is uploaded to GitHub Releases. When users install via `npx`, the database is automatically downloaded and cached on first run.

## Directory Review Notes

### Testing Account and Sample Data

This server is read-only and does not require a login account for functional review.
For directory review, use the bundled dataset and these sample prompts:

- _"Search Dutch legislation for persoonsgegevens verwerking"_
- _"Get BWBR0005289 provision 6:162"_
- _"Which Dutch statutes implement GDPR?"_

### Remote Authentication (OAuth 2.0)

When deployed over Streamable HTTP, this server can run in read-only unauthenticated mode.
If authentication is required in your deployment, configure OAuth 2.0 over TLS with certificates from recognized authorities.

### Privacy

See [PRIVACY.md](PRIVACY.md) for data handling, retention, and security disclosures.

### Troubleshooting

- If startup fails, confirm the database path via `DUTCH_LAW_DB_PATH`.
- If HTTP clients fail, verify `/mcp` POST routing and session headers.
- If results are empty, call `list_regulations` first to confirm dataset load.

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official wetten.overheid.nl publications. However:
>
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is limited** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources for court filings
> - **EU cross-references** are extracted from Dutch statute text, not EUR-Lex full text

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. Lawyers should consider Nederlandse Orde van Advocaten (Dutch Bar Association) confidentiality obligations when using cloud-based AI tools.

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)

**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/dutch-law-mcp (This Project)

**Query 3,248 Dutch statutes directly from Claude** -- BW, Sr, Awb, and more. Full provision text with EU cross-references. `npx @ansvar/dutch-law-mcp`

### [@ansvar/german-law-mcp](https://github.com/Ansvar-Systems/German-law-mcp)

**Query 6,870 German statutes directly from Claude** -- BGB, StGB, GG, and more. Full provision text with EU cross-references. `npx @ansvar/german-law-mcp`

### [@ansvar/swedish-law-mcp](https://github.com/Ansvar-Systems/swedish-law-mcp)

**Query 717 Swedish statutes directly from Claude** -- DSL, BrB, ABL, MB, and more. Full provision text with EU cross-references. `npx @ansvar/swedish-law-mcp`

### [@ansvar/slovenian-law-mcp](https://github.com/Ansvar-Systems/Slovenian-law-mcp)

**Query Slovenian statutes directly from Claude** -- ZVOP-2, KZ-1, ZGD-1, and more. Full provision text with EU cross-references. `npx @ansvar/slovenian-law-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)

**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npm install @ansvar/us-regulations-mcp`

### [@ansvar/ot-security-mcp](https://github.com/Ansvar-Systems/ot-security-mcp)

**Query IEC 62443, NIST 800-82/53, and MITRE ATT&CK for ICS** -- Specialized for OT/ICS environments. `npx @ansvar/ot-security-mcp`

### [@ansvar/automotive-cybersecurity-mcp](https://github.com/Ansvar-Systems/Automotive-MCP)

**Query UNECE R155/R156 and ISO 21434** -- Automotive cybersecurity compliance. `npx @ansvar/automotive-cybersecurity-mcp`

### [@ansvar/sanctions-mcp](https://github.com/Ansvar-Systems/Sanctions-MCP)

**Offline-capable sanctions screening** -- OFAC, EU, UN sanctions lists. `pip install ansvar-sanctions-mcp`

## Citation

If you use this MCP server in academic research:

```bibtex
@software{dutch_law_mcp_2025,
  author = {Ansvar Systems AB},
  title = {Dutch Law MCP Server: Production-Grade Legal Research Tool},
  year = {2025},
  url = {https://github.com/Ansvar-Systems/Dutch-law-mcp},
  note = {Comprehensive Dutch legal database with 3,248 statutes, 903,000+ court decisions, and EU cross-references}
}
```

## License

Apache-2.0

### Data Licenses

- **Statutes & Regulations:** wetten.overheid.nl (public domain, Dutch government open data)
- **Case Law:** rechtspraak.nl (public domain, open data portal)
- **Kamerstukken:** Staten-Generaal (public domain)
- **EU Metadata:** EUR-Lex (EU public domain)

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. This MCP server is part of our growing suite of jurisdiction-specific legal research tools.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden
