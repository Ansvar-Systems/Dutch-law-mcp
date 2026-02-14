# Dutch Law MCP Server

Production-grade [Model Context Protocol](https://modelcontextprotocol.io/) server for Dutch legal research. Provides AI assistants with structured access to 3,248 Dutch statutes, 903,000+ court decisions, 21,000+ kamerstukken, and 1,000+ EU cross-references.

## Installation

```bash
npm install @ansvar/dutch-law-mcp
```

On first run, the ~1 GB SQLite database is automatically downloaded from GitHub Releases and cached at `~/.cache/dutch-law-mcp/database.db`. Subsequent runs use the cached copy.

### Claude Desktop Configuration

Add to your Claude Desktop configuration file (`claude_desktop_config.json`):

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

Or with a custom database path (skips download):

```json
{
  "mcpServers": {
    "dutch-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/dutch-law-mcp"],
      "env": {
        "DUTCH_LAW_DB_PATH": "/path/to/database.db"
      }
    }
  }
}
```

### HTTP Endpoint (ChatGPT, Claude browser, remote clients)

For clients that connect over HTTP instead of stdio:

```bash
npx @ansvar/dutch-law-mcp-http
```

Or run directly:

```bash
npm run start:http
```

The HTTP server exposes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (`{ "status": "healthy" }`) |
| `/mcp` | GET | Server metadata JSON |
| `/mcp` | POST | MCP protocol (Streamable HTTP transport) |
| `/mcp` | DELETE | Session termination |

Configure with environment variables:

```bash
PORT=3000      # HTTP port (default: 3000)
HOST=0.0.0.0   # Bind address (default: 0.0.0.0)
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_legislation` | Full-text search across Dutch statutes and regulations (FTS5-indexed) |
| `get_provision` | Retrieve a specific provision by BWB-ID, book, and article (e.g., Art. 6:162 BW) |
| `search_case_law` | Search Dutch court decisions with filters for court, legal domain, and date range |
| `get_preparatory_works` | Get kamerstukken (parliamentary documents) for a statute |
| `validate_citation` | Validate Dutch legal citations and check database existence |
| `build_legal_stance` | Build comprehensive research bundles combining statutes, case law, and travaux |
| `format_citation` | Format citations to standard Dutch legal citation format |
| `check_currency` | Check whether a statute or provision is currently in force (geldend recht) |
| `get_eu_basis` | Get EU legal basis (directives/regulations) for a Dutch statute |
| `get_dutch_implementations` | Find Dutch statutes implementing a given EU directive or regulation |
| `search_eu_implementations` | Search EU instruments and their Dutch implementations |
| `get_provision_eu_basis` | Get EU references for a specific provision |
| `validate_eu_compliance` | Validate EU compliance for a Dutch statute or provision |
| `get_provision_at_date` | Retrieve a specific provision as it was at a given date (historical versioning) |

## Data Sources

| Source | Description | URL |
|--------|-------------|-----|
| **wetten.overheid.nl** | Official BWB (Basiswettenbestand) for Dutch statutes and regulations | https://wetten.overheid.nl |
| **rechtspraak.nl** | Open data portal for Dutch court decisions | https://uitspraken.rechtspraak.nl |
| **EUR-Lex** | Official EU legislation database | https://eur-lex.europa.eu |

All data is sourced from official open data portals and stored locally in a SQLite database for fast, offline-capable lookups.

## Data Coverage

| Metric | Count |
|--------|-------|
| **Statutes** | 3,248 (wetten, AMvBs, ministerial regulations) |
| **Provisions** | 79,967 individual articles |
| **Case law** | 903,000+ court decisions (ECLI-indexed) |
| **Kamerstukken** | 21,891 parliamentary documents |
| **EU documents** | 1,008 directives and regulations |
| **Definitions** | 64 extracted legal terms |

## Supported Citation Formats

- **Statute articles**: `Art. 6:162 BW`, `art. 287 Sr`, `art. 8:1 Awb`
- **ECLI references**: `ECLI:NL:HR:2019:376`
- **Kamerstukken**: `Kamerstukken II 2020/21, 35815, nr. 2`
- **EU instruments**: `Verordening (EU) 2016/679`, `Richtlijn 95/46/EG`

## Development

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

## Releasing

To prepare a new release with the database artifact:

```bash
npm run prepare-release   # Creates data/database.db.gz
gh release create v1.0.0
gh release upload v1.0.0 data/database.db.gz
npm publish
```

The gzipped database is uploaded to GitHub Releases. When users install via `npx`, the database is automatically downloaded and cached on first run.

## License

Apache-2.0
