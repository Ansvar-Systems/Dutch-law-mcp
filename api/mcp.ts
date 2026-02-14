import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';

import { registerTools } from '../src/tools/registry.js';

// Defined here instead of importing from src/index.ts to avoid triggering
// the stdio server's main() entry point (which calls process.exit on failure).
const SERVER_NAME = 'dutch-legal-citations';
const SERVER_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Database — downloaded from GitHub Releases on cold start, cached in /tmp
// ---------------------------------------------------------------------------

const TMP_DB = '/tmp/database.db';
const TMP_DB_LOCK = '/tmp/database.db.lock';

const GITHUB_OWNER = 'Ansvar-Systems';
const GITHUB_REPO = 'Dutch-law-mcp';
const GITHUB_TAG = `v${SERVER_VERSION}`;
const ASSET_NAME = 'database.db.gz';

let db: InstanceType<typeof Database> | null = null;

function httpsGetRaw(
  url: string,
  headers: Record<string, string>,
): Promise<http.IncomingMessage> {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          headers: { 'User-Agent': 'dutch-law-mcp', ...headers },
        },
        resolve,
      )
      .on('error', reject);
  });
}

async function followRedirects(
  url: string,
  headers: Record<string, string>,
  maxRedirects = 10,
): Promise<http.IncomingMessage> {
  let currentUrl = url;
  for (let i = 0; i < maxRedirects; i++) {
    const res = await httpsGetRaw(currentUrl, headers);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      currentUrl = res.headers.location;
      // Don't send auth headers to redirected hosts (e.g. Azure blob storage)
      headers = {};
      res.resume();
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw new Error(`HTTP ${status} downloading ${currentUrl}`);
    }
    return res;
  }
  throw new Error('Too many redirects');
}

async function resolveDownloadUrl(): Promise<{
  url: string;
  headers: Record<string, string>;
}> {
  // Allow explicit override (e.g. public URL, S3 presigned URL)
  if (process.env.DUTCH_LAW_DB_URL) {
    return { url: process.env.DUTCH_LAW_DB_URL, headers: {} };
  }

  // Use GitHub API to get the asset download URL (works for private repos)
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN is required to download the database from a private GitHub repo. ' +
        'Set it as a Vercel environment variable, or set DUTCH_LAW_DB_URL to a public download URL.',
    );
  }

  // Step 1: Find the asset ID for database.db.gz in the release
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_TAG}`;
  const authHeaders = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  const releaseRes = await followRedirects(apiUrl, authHeaders);
  const chunks: Buffer[] = [];
  for await (const chunk of releaseRes) {
    chunks.push(chunk as Buffer);
  }
  const release = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  const asset = release.assets?.find(
    (a: { name: string }) => a.name === ASSET_NAME,
  );
  if (!asset) {
    throw new Error(
      `Asset "${ASSET_NAME}" not found in release ${GITHUB_TAG}`,
    );
  }

  // Step 2: Return the API asset URL with octet-stream accept header
  return {
    url: asset.url as string,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/octet-stream',
    },
  };
}

async function downloadDatabase(): Promise<void> {
  const tmpPath = TMP_DB + '.tmp';
  const { url, headers } = await resolveDownloadUrl();
  console.log(`[dutch-law-mcp] Downloading database...`);

  const res = await followRedirects(url, headers);
  const gunzip = zlib.createGunzip();
  const fileStream = fs.createWriteStream(tmpPath);
  await pipeline(res, gunzip, fileStream);

  fs.renameSync(tmpPath, TMP_DB);
  const size = fs.statSync(TMP_DB).size;
  console.log(
    `[dutch-law-mcp] Database ready (${(size / 1024 / 1024).toFixed(0)} MB)`,
  );
}

async function getDatabase(): Promise<InstanceType<typeof Database>> {
  if (db) return db;

  // Clean stale lock from previous invocations
  if (fs.existsSync(TMP_DB_LOCK)) {
    fs.rmSync(TMP_DB_LOCK, { recursive: true, force: true });
  }

  // Check for pre-existing DB (env override or bundled)
  const envDb = process.env.DUTCH_LAW_DB_PATH;
  if (envDb && fs.existsSync(envDb)) {
    if (!fs.existsSync(TMP_DB)) {
      fs.copyFileSync(envDb, TMP_DB);
    }
  } else if (
    !fs.existsSync(TMP_DB) &&
    fs.existsSync(path.join(process.cwd(), 'data', 'database.db'))
  ) {
    fs.copyFileSync(path.join(process.cwd(), 'data', 'database.db'), TMP_DB);
  }

  // Download from GitHub Releases if still missing
  if (!fs.existsSync(TMP_DB)) {
    await downloadDatabase();
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
    const database = await getDatabase();

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
