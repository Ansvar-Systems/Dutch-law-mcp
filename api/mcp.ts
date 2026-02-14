import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import { existsSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';

import { registerTools } from '../src/tools/registry.js';

// Defined here instead of importing from src/index.ts to avoid triggering
// the stdio server's main() entry point (which calls process.exit on failure).
const SERVER_NAME = 'dutch-legal-citations';
const SERVER_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Database — bundled free-tier DB, copied to /tmp on cold start
// ---------------------------------------------------------------------------

const SOURCE_DB = join(process.cwd(), 'data', 'database-free.db');
const TMP_DB = '/tmp/database.db';
const TMP_DB_LOCK = '/tmp/database.db.lock';

let db: InstanceType<typeof Database> | null = null;

function getDatabase(): InstanceType<typeof Database> {
  if (db) return db;

  // Clean stale lock from previous invocations
  if (existsSync(TMP_DB_LOCK)) {
    rmSync(TMP_DB_LOCK, { recursive: true, force: true });
  }

  // Copy bundled free-tier DB to /tmp for read access
  if (!existsSync(TMP_DB)) {
    const envDb = process.env.DUTCH_LAW_DB_PATH;
    if (envDb && existsSync(envDb)) {
      copyFileSync(envDb, TMP_DB);
    } else {
      copyFileSync(SOURCE_DB, TMP_DB);
    }
  }

  db = new Database(TMP_DB, { readonly: true });
  db.pragma('foreign_keys = ON');
  return db;
}

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, mcp-session-id',
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: 'mcp-streamable-http',
    });
    return;
  }

  try {
    const database = getDatabase();

    const server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } },
    );

    registerTools(server, () => database);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MCP handler error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}
