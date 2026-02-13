# Dutch Law MCP Server

Production-grade [Model Context Protocol](https://modelcontextprotocol.io/) server for Dutch legal research. Provides AI assistants with structured access to Dutch statutes (wetten), case law (rechtspraak), preparatory works (kamerstukken), and EU cross-references.

## Installation

```bash
npm install @ansvar/dutch-law-mcp
```

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

Or with a custom database path:

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

## Data Sources

| Source | Description | URL |
|--------|-------------|-----|
| **wetten.overheid.nl** | Official BWB (Basiswettenbestand) for Dutch statutes and regulations | https://wetten.overheid.nl |
| **rechtspraak.nl** | Open data portal for Dutch court decisions | https://uitspraken.rechtspraak.nl |
| **EUR-Lex** | Official EU legislation database | https://eur-lex.europa.eu |

All data is sourced from official open data portals and stored locally in a SQLite database for fast, offline-capable lookups.

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

### Ingestion Scripts

```bash
npm run ingest              # Ingest statutes from wetten.overheid.nl (BWB)
npm run ingest:cases        # Ingest case law from rechtspraak.nl
npm run build:db            # Build the SQLite database from seed files
npm run audit:seeds         # Validate seed file schema compliance
npm run check-updates       # Check for legal data updates
```

### Project Structure

```
src/
  index.ts              # MCP server entry point
  tools/                # 13 MCP tool implementations
  parsers/              # BWB XML parser, EU reference parser
  citation/             # Citation parsing and formatting
  types/                # TypeScript type definitions
  utils/                # Shared utilities
scripts/                # Ingestion and build scripts
tests/                  # Vitest test suites
data/
  seed/                 # JSON seed files (one per statute/batch)
  database.db           # SQLite database (built from seeds)
```

## License

Apache-2.0
