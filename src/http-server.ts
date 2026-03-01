#!/usr/bin/env node

/**
 * HTTP entry point for the Dutch Law MCP server.
 *
 * Endpoints:
 *   GET  /health  → { status: "healthy" }
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

const transports: Record<string, StreamableHTTPServerTransport> = {};

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
    res.end(JSON.stringify({ status: 'healthy' }));
    return;
  }

  // GET /mcp — metadata
  if (url.pathname === '/mcp' && method === 'GET') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && transports[sessionId]) {
      // Existing session — handle as SSE stream for server-initiated messages
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
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
        tools: 14,
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

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && transports[sessionId]) {
      // Existing session — delegate to its transport
      const transport = transports[sessionId];
      await transport.handleRequest(req, res, parsed);
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

    // Create new transport + server for this session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const server = createServer(getDb);
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && transports[sid]) {
        delete transports[sid];
        console.error(`[${SERVER_NAME}] Session ${sid} closed`);
      }
      server.close().catch(() => {});
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, parsed);

    // Store the transport AFTER handleRequest — sessionId is set during
    // the initialize request, so it's undefined before handleRequest runs.
    if (transport.sessionId) {
      transports[transport.sessionId] = transport;
    }
    return;
  }

  // DELETE /mcp — session termination
  if (url.pathname === '/mcp' && method === 'DELETE') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports[sessionId]) {
      const transport = transports[sessionId];
      await transport.close();
      delete transports[sessionId];
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
  const dbPath = await ensureDatabase();
  dbInstance = openDb(dbPath);
  console.error(`[${SERVER_NAME}] Database loaded from ${dbPath}`);

  const httpServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error(`[${SERVER_NAME}] Unhandled error:`, err);
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

    // Close all active sessions
    for (const [sid, transport] of Object.entries(transports)) {
      transport.close().catch(() => {});
      delete transports[sid];
    }

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
