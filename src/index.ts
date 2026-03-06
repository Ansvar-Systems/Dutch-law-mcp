#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { registerTools } from './tools/registry.js';
import { ensureDatabase } from './utils/ensure-database.js';
import {
  detectCapabilities,
  readDbMetadata,
  type Capability,
  type DbMetadata,
} from './capabilities.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

export { SERVER_NAME, SERVER_VERSION };
const DB_ENV_VAR = 'DUTCH_LAW_DB_PATH';
const DEFAULT_DB_PATH = '../data/database.db';

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDefaultDbPath(): string {
  return path.resolve(__dirname, DEFAULT_DB_PATH);
}

let dbInstance: InstanceType<typeof Database> | null = null;
let dbCapabilities: Set<Capability> | null = null;
let dbMetadata: DbMetadata | null = null;

export function openDb(dbPath: string): InstanceType<typeof Database> {
  const db = new Database(dbPath, { readonly: true });
  db.pragma('journal_mode = WAL', { simple: true });
  return db;
}

function getDb(): InstanceType<typeof Database> {
  if (!dbInstance) {
    const dbPath = process.env[DB_ENV_VAR] ?? getDefaultDbPath();
    dbInstance = openDb(dbPath);

    // Detect capabilities on first open
    dbCapabilities = detectCapabilities(dbInstance);
    dbMetadata = readDbMetadata(dbInstance);
    console.error(
      `[${SERVER_NAME}] Database tier: ${dbMetadata.tier}, capabilities: ${[...dbCapabilities].join(', ')}`,
    );
  }
  return dbInstance;
}

export function getCapabilities(): Set<Capability> {
  if (!dbCapabilities) getDb();
  return dbCapabilities!;
}

export function getMetadata(): DbMetadata {
  if (!dbMetadata) getDb();
  return dbMetadata!;
}

function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// ---------------------------------------------------------------------------
// Server factory (shared with http-server.ts)
// ---------------------------------------------------------------------------

export function createServer(getDbFn: () => InstanceType<typeof Database>): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Register all 15 MCP tools
  registerTools(server, getDbFn);

  // Resources
  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: [
      {
        uri: 'case-law-stats://dutch-law-mcp/metadata',
        name: 'Dutch Legal Database Metadata',
        description:
          'Metadata about the Dutch legal database including data sources, coverage, and freshness.',
        mimeType: 'application/json',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    const { uri } = request.params;

    if (uri === 'case-law-stats://dutch-law-mcp/metadata') {
      const metadata = {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        sources: {
          statutes: {
            name: 'wetten.overheid.nl',
            description: 'Official BWB (Basiswettenbestand) for Dutch statutes and regulations',
            url: 'https://wetten.overheid.nl',
            license: 'Open Data',
          },
          case_law: {
            name: 'rechtspraak.nl',
            description: 'Official open data portal for Dutch court decisions',
            url: 'https://uitspraken.rechtspraak.nl',
            license: 'Open Data',
          },
          eu_law: {
            name: 'EUR-Lex',
            description: 'Official EU legislation database',
            url: 'https://eur-lex.europa.eu',
            license: 'Open Data',
          },
        },
        attribution:
          'Data sourced from wetten.overheid.nl and rechtspraak.nl. Case law metadata provided under Open Data license.',
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(metadata, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  return server;
}

// ---------------------------------------------------------------------------
// Start (stdio)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Ensure database exists (downloads from GitHub Releases if needed)
  const dbPath = await ensureDatabase();
  // Make the resolved path available to getDb() and child processes
  process.env[DB_ENV_VAR] = dbPath;

  const server = createServer(getDb);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server started on stdio`);
}

process.on('SIGINT', () => {
  console.error(`[${SERVER_NAME}] Shutting down (SIGINT)...`);
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error(`[${SERVER_NAME}] Shutting down (SIGTERM)...`);
  closeDb();
  process.exit(0);
});

main().catch((error: unknown) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  closeDb();
  process.exit(1);
});
