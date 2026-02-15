import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, rmdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import Database from '@ansvar/mcp-sqlite';
import { registerTools } from '../../src/tools/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

interface GoldenTestAssertions {
  result_not_empty?: boolean;
  text_contains?: string[];
  any_result_contains?: string[];
  fields_present?: string[];
  text_not_empty?: boolean;
  min_results?: number;
  citation_url_pattern?: string;
  upstream_text_hash?: { url: string; expected_sha256: string };
  citation_resolves?: boolean;
  handles_gracefully?: boolean;
}

interface GoldenTest {
  id: string;
  category: string;
  description: string;
  tool: string;
  input: Record<string, unknown>;
  assertions: GoldenTestAssertions;
}

interface GoldenTestsFile {
  $schema?: string;
  version: string;
  mcp_name: string;
  description: string;
  tests: GoldenTest[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ToolResult {
  tool: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .toLowerCase();
}

function sha256(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex');
}

function extractCitationUrls(data: unknown): string[] {
  const urls: string[] = [];
  const text = JSON.stringify(data);
  const urlRegex = /https?:\/\/[^\s"'<>]+/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[0]);
  }
  return urls;
}

async function fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function stringifyData(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 0) ?? '';
}

async function callTool(
  mcpClient: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await mcpClient.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content?.[0]?.text ?? '';

    if (result.isError) {
      return { tool: name, ok: false, error: { code: 'TOOL_ERROR', message: text } };
    }

    try {
      const data = JSON.parse(text) as unknown;
      return { tool: name, ok: true, data };
    } catch {
      return { tool: name, ok: true, data: text };
    }
  } catch (err) {
    return {
      tool: name,
      ok: false,
      error: { code: 'CALL_ERROR', message: (err as Error).message },
    };
  }
}

// ---------------------------------------------------------------------------
// Load fixtures & set up MCP client/server
// ---------------------------------------------------------------------------

const fixturesPath = join(__dirname, '..', '..', 'fixtures', 'golden-tests.json');
const fixtureContent = readFileSync(fixturesPath, 'utf-8');
const fixture = JSON.parse(fixtureContent) as GoldenTestsFile;

const isNightly = process.env['CONTRACT_MODE'] === 'nightly';

let mcpClient: Client;
let db: InstanceType<typeof Database>;

// ---------------------------------------------------------------------------
// Contract test runner
// ---------------------------------------------------------------------------

describe(`Contract tests: ${fixture.mcp_name}`, () => {
  beforeAll(async () => {
    const dbPath =
      process.env['DUTCH_LAW_DB_PATH'] ?? join(__dirname, '..', '..', 'data', 'database.db');
    // node-sqlite3-wasm leaves a .lock dir on close — remove stale lock before opening
    try {
      rmdirSync(dbPath + '.lock');
    } catch {
      /* ignore */
    }
    db = new Database(dbPath, { readonly: true });

    const server = new Server(
      { name: 'dutch-law-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    );
    registerTools(server, () => db);

    mcpClient = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  }, 30_000);

  afterAll(() => {
    db?.close();
  });
  for (const test of fixture.tests) {
    describe(`[${test.id}] ${test.description}`, () => {
      let result: ToolResult;

      it('runs without throwing', async () => {
        result = await callTool(mcpClient, test.tool, test.input);
        expect(result).toBeDefined();
        expect(result.tool).toBe(test.tool);
      });

      if (test.assertions.result_not_empty) {
        it('result is not empty', async () => {
          result ??= await callTool(mcpClient, test.tool, test.input);
          if (result.ok) {
            expect(result.data).toBeDefined();
          } else {
            expect(result.error).toBeDefined();
          }
        });
      }

      if (test.assertions.text_contains) {
        for (const needle of test.assertions.text_contains) {
          it(`result contains text "${needle}"`, async () => {
            result ??= await callTool(mcpClient, test.tool, test.input);
            const haystack = stringifyData(result.data).toLowerCase();
            expect(haystack).toContain(needle.toLowerCase());
          });
        }
      }

      if (test.assertions.any_result_contains) {
        for (const needle of test.assertions.any_result_contains) {
          it(`any result item contains "${needle}"`, async () => {
            result ??= await callTool(mcpClient, test.tool, test.input);
            const haystack = stringifyData(result.data).toLowerCase();
            expect(haystack).toContain(needle.toLowerCase());
          });
        }
      }

      if (test.assertions.fields_present) {
        it(`result has fields: ${test.assertions.fields_present.join(', ')}`, async () => {
          result ??= await callTool(mcpClient, test.tool, test.input);
          expect(result.ok).toBe(true);
          const data = result.data as Record<string, unknown>;
          expect(data).toBeDefined();
          for (const field of test.assertions.fields_present!) {
            expect(data).toHaveProperty(field);
          }
        });
      }

      if (test.assertions.text_not_empty) {
        it('result text is not empty', async () => {
          result ??= await callTool(mcpClient, test.tool, test.input);
          const text = stringifyData(result.data);
          expect(text.trim().length).toBeGreaterThan(0);
        });
      }

      if (test.assertions.min_results !== undefined) {
        it(`returns at least ${test.assertions.min_results} results`, async () => {
          result ??= await callTool(mcpClient, test.tool, test.input);
          const data = result.data;
          const items = Array.isArray(data)
            ? data
            : Array.isArray((data as Record<string, unknown>)?.results)
              ? ((data as Record<string, unknown>).results as unknown[])
              : [];
          expect(items.length).toBeGreaterThanOrEqual(test.assertions.min_results!);
        });
      }

      if (test.assertions.citation_url_pattern) {
        it(`citation URLs match pattern: ${test.assertions.citation_url_pattern}`, async () => {
          result ??= await callTool(mcpClient, test.tool, test.input);
          const urls = extractCitationUrls(result.data);
          const pattern = new RegExp(test.assertions.citation_url_pattern!);
          expect(urls.length).toBeGreaterThan(0);
          for (const url of urls) {
            expect(url).toMatch(pattern);
          }
        });
      }

      if (test.assertions.upstream_text_hash) {
        const hashAssertion = test.assertions.upstream_text_hash;
        it.skipIf(!isNightly)(
          `upstream text hash matches for ${hashAssertion.url}`,
          async () => {
            const response = await fetchWithTimeout(hashAssertion.url);
            expect(response.ok).toBe(true);
            const body = await response.text();
            const hash = sha256(body);
            expect(hash).toBe(hashAssertion.expected_sha256);
          },
          30_000,
        );
      }

      if (test.assertions.citation_resolves) {
        it.skipIf(!isNightly)(
          'citation URLs resolve (HTTP 200)',
          async () => {
            result ??= await callTool(mcpClient, test.tool, test.input);
            const urls = extractCitationUrls(result.data);
            expect(urls.length).toBeGreaterThan(0);
            for (const url of urls) {
              const response = await fetchWithTimeout(url);
              expect(response.ok, `Expected HTTP 200 for ${url}, got ${response.status}`).toBe(
                true,
              );
            }
          },
          60_000,
        );
      }

      if (test.assertions.handles_gracefully) {
        it('handles gracefully (no unhandled exception)', async () => {
          result ??= await callTool(mcpClient, test.tool, test.input);
          expect(result.tool).toBe(test.tool);
        });
      }
    });
  }
});
