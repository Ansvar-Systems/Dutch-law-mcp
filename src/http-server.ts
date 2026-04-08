#!/usr/bin/env node

/**
 * HTTP entry point for the Dutch Law MCP server.
 *
 * Endpoints:
 *   GET  /health  → { status: "ok", server, version, uptime_seconds, capabilities, tier }
 *   GET  /mcp     → server metadata JSON
 *   POST /mcp     → MCP protocol (Streamable HTTP transport)
 *   DELETE /mcp   → session termination
 *   OPTIONS *     → CORS preflight
 *
 * Uses Node.js built-in `http` module — no Express dependency required.
 * Database is a singleton (read-only SQLite in WAL mode, safe for concurrent reads).
 */

import * as http from 'http';
import { randomUUID } from 'crypto';
import type Database from '@ansvar/mcp-sqlite';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { createServer, openDb, SERVER_NAME, SERVER_VERSION } from './index.js';
import { ensureDatabase } from './utils/ensure-database.js';
import { prepareRuntimeDatabase } from './utils/runtime-db.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------

let dbInstance: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }
  return dbInstance;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS ?? '100', 10);
const SESSION_IDLE_TTL_MS = parseInt(process.env.SESSION_IDLE_TTL_MS ?? '900000', 10); // 15 min idle

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

// Use Map instead of plain object to prevent prototype pollution via session IDs
const sessions = new Map<string, SessionEntry>();

/** UUID v4 pattern for validating session IDs (prevents injection). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate and return a safe session ID, or undefined if invalid. */
function safeSessionId(raw: string | undefined): string | undefined {
  if (!raw || !UUID_RE.test(raw)) return undefined;
  return raw;
}

/** Evict idle sessions to prevent unbounded memory growth. */
function evictIdleSessions(): void {
  const cutoff = Date.now() - SESSION_IDLE_TTL_MS;
  for (const [sid, entry] of sessions) {
    if (entry.lastActivity < cutoff) {
      entry.transport.close().catch(() => {});
      sessions.delete(sid);
      console.error(`[${SERVER_NAME}] Session ${sid} expired (TTL)`);
    }
  }
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
}

// ---------------------------------------------------------------------------
// Body parser
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method?.toUpperCase() ?? 'GET';

  setCorsHeaders(res);

  // OPTIONS — CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /health
  if (url.pathname === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        server: SERVER_NAME,
        version: SERVER_VERSION,
        uptime_seconds: Math.floor(process.uptime()),
        capabilities: dbInstance
          ? ['statutes', 'eu_cross_references', 'case_law', 'preparatory_works']
          : [],
        tier: 'professional',
      }),
    );
    return;
  }

  // GET /mcp — metadata or SSE stream
  if (url.pathname === '/mcp' && method === 'GET') {
    const sessionId = safeSessionId(req.headers['mcp-session-id'] as string | undefined);
    const session = sessionId ? sessions.get(sessionId) : undefined;

    if (session) {
      // Existing session — handle as SSE stream for server-initiated messages
      session.lastActivity = Date.now();
      await session.transport.handleRequest(req, res);
      return;
    }

    // No session — return metadata
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        protocol: 'mcp',
        transport: 'streamable-http',
        tools: 15,
        description:
          'Dutch legal research MCP server — statutes, case law, kamerstukken, EU cross-references',
      }),
    );
    return;
  }

  // POST /mcp — MCP protocol
  if (url.pathname === '/mcp' && method === 'POST') {
    const body = await readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const sessionId = safeSessionId(req.headers['mcp-session-id'] as string | undefined);
    const existingSession = sessionId ? sessions.get(sessionId) : undefined;

    if (existingSession) {
      // Existing session — delegate to its transport
      existingSession.lastActivity = Date.now();
      await existingSession.transport.handleRequest(req, res, parsed);
      return;
    }

    // New session — must be an initialize request
    if (!isInitializeRequest(parsed)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Bad Request: expected initialize request for new session',
          },
          id: null,
        }),
      );
      return;
    }

    // Enforce max sessions — evict idle sessions first
    evictIdleSessions();
    if (sessions.size >= MAX_SESSIONS) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many active sessions. Try again later.' }));
      return;
    }

    // Create new transport + server for this session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const server = createServer(getDb);
    let sessionClosed = false;
    transport.onclose = () => {
      if (sessionClosed) {
        return;
      }
      sessionClosed = true;
      const sid = transport.sessionId;
      if (sid && sessions.has(sid)) {
        sessions.delete(sid);
        console.error(`[${SERVER_NAME}] Session ${sid} closed`);
      }
      server.close().catch(() => {});
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, parsed);

    // Store the session (must be after handleRequest — sessionId is set during request handling)
    if (transport.sessionId) {
      sessions.set(transport.sessionId, { transport, lastActivity: Date.now() });
    }
    return;
  }

  // DELETE /mcp — session termination
  if (url.pathname === '/mcp' && method === 'DELETE') {
    const sessionId = safeSessionId(req.headers['mcp-session-id'] as string | undefined);
    const sessionToClose = sessionId ? sessions.get(sessionId) : undefined;
    if (sessionToClose) {
      await sessionToClose.transport.close();
      sessions.delete(sessionId!);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'session closed' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Ensure database exists (downloads if needed)
  const sourceDbPath = await ensureDatabase();
  const runtimeDbPath = prepareRuntimeDatabase(sourceDbPath);
  dbInstance = openDb(runtimeDbPath);
  console.error(`[${SERVER_NAME}] Database loaded from ${runtimeDbPath} (source: ${sourceDbPath})`);

  const httpServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((err: unknown) => {
      console.error(`[${SERVER_NAME}] Unhandled request error:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  });

  httpServer.listen(PORT, HOST, () => {
    console.error(`[${SERVER_NAME}] HTTP server listening on http://${HOST}:${PORT}`);
    console.error(`[${SERVER_NAME}]   Health: GET /health`);
    console.error(`[${SERVER_NAME}]   MCP:    POST /mcp`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.error(`[${SERVER_NAME}] Shutting down (${signal})...`);

    evictIdleSessions();

    // Close all active sessions
    for (const [, entry] of sessions) {
      entry.transport.close().catch(() => {});
    }
    sessions.clear();

    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }

    httpServer.close(() => process.exit(0));
    // Force exit after 5 seconds
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});
