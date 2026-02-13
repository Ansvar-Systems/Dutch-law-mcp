#!/usr/bin/env tsx
/**
 * EUR-Lex metadata fetcher.
 *
 * Fetches metadata for EU directives and regulations from EUR-Lex
 * SPARQL endpoint and writes EU document seed data.
 *
 * Usage: npm run fetch:eurlex
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EURLEX_SPARQL_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';
const RATE_LIMIT_MS = 2000;
const MIN_YEAR = 1990;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EUDocumentSeed {
  id: string;
  type: 'directive' | 'regulation' | 'decision';
  year: number;
  number: number;
  community?: string;
  celex_number?: string;
  title?: string;
  title_nl?: string;
  short_name?: string;
  adoption_date?: string;
  entry_into_force_date?: string;
  in_force?: number;
  amended_by?: string;
  repeals?: string;
  url_eur_lex?: string;
  description?: string;
}

interface SparqlBinding {
  type: string;
  value: string;
  'xml:lang'?: string;
}

interface SparqlResult {
  work?: SparqlBinding;
  celex?: SparqlBinding;
  title?: SparqlBinding;
  titleNL?: SparqlBinding;
  date?: SparqlBinding;
  inForce?: SparqlBinding;
}

interface SparqlResponse {
  head: {
    vars: string[];
  };
  results: {
    bindings: SparqlResult[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse CELEX number to extract type, year, and number.
 * Format: 3YYYYLTNNNN or 3YYYYRNNNN
 * - 3 = sector (EU legislation)
 * - YYYY = year
 * - L = directive, R = regulation
 * - T = treaty (optional)
 * - NNNN = number
 *
 * Examples:
 * - 32016L0680 -> directive, 2016, 680, EU
 * - 32016R0679 -> regulation, 2016, 679, EU
 * - 31995L0046 -> directive, 1995, 46, EU
 */
function parseCelex(celex: string): {
  type: 'directive' | 'regulation' | 'decision' | null;
  year: number | null;
  number: number | null;
  community: string;
} {
  // Remove any whitespace
  celex = celex.trim();

  // Must start with 3 (EU legislation sector)
  if (!celex.startsWith('3')) {
    return { type: null, year: null, number: null, community: 'EU' };
  }

  // Extract year (positions 1-4)
  const yearStr = celex.substring(1, 5);
  const year = parseInt(yearStr, 10);
  if (isNaN(year) || year < 1900 || year > 2100) {
    return { type: null, year: null, number: null, community: 'EU' };
  }

  // Extract document type letter
  let typePos = 5;
  let type: 'directive' | 'regulation' | 'decision' | null = null;
  let community = 'EU';

  // Check for community code
  if (celex.length > 5) {
    const char = celex[typePos];
    if (char === 'L') {
      type = 'directive';
      typePos++;
    } else if (char === 'R') {
      type = 'regulation';
      typePos++;
    } else if (char === 'D') {
      type = 'decision';
      typePos++;
    }
  }

  if (!type) {
    return { type: null, year, number: null, community };
  }

  // Extract number (rest of string after type letter)
  const numberStr = celex.substring(typePos);
  const number = parseInt(numberStr, 10);
  if (isNaN(number)) {
    return { type, year, number: null, community };
  }

  return { type, year, number, community };
}

/**
 * Generate document ID from parsed CELEX data.
 */
function generateDocumentId(parsed: ReturnType<typeof parseCelex>): string | null {
  if (!parsed.type || !parsed.year || parsed.number === null) {
    return null;
  }
  return `${parsed.type}-${parsed.year}-${parsed.number}-${parsed.community}`;
}

/**
 * Convert date string to ISO format (YYYY-MM-DD).
 */
function formatDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return undefined;
    return date.toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

/**
 * Query EUR-Lex SPARQL endpoint.
 */
async function querySparql(query: string): Promise<SparqlResponse | null> {
  const url = new URL(EURLEX_SPARQL_ENDPOINT);
  url.searchParams.set('query', query);

  try {
    console.log(`  Querying EUR-Lex SPARQL endpoint...`);
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'Dutch-law-mcp-fetcher/1.0',
      },
    });

    if (!response.ok) {
      console.error(`  ERROR: HTTP ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as SparqlResponse;
    return data;
  } catch (err) {
    console.error(`  ERROR: Failed to query SPARQL endpoint: ${err}`);
    return null;
  }
}

/**
 * Fetch EU directives from EUR-Lex.
 */
async function fetchDirectives(): Promise<EUDocumentSeed[]> {
  console.log('Fetching EU directives...');

  const query = `
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?work ?celex ?title ?titleNL ?date ?inForce WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_date_document ?date .
  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce }
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?expr cdm:expression_title ?title .
  OPTIONAL {
    ?exprNL cdm:expression_belongs_to_work ?work .
    ?exprNL cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/NLD> .
    ?exprNL cdm:expression_title ?titleNL .
  }
  FILTER(STRSTARTS(?celex, "3"))
  FILTER(CONTAINS(?celex, "L"))
  FILTER(YEAR(?date) >= ${MIN_YEAR})
}
ORDER BY DESC(?date)
LIMIT 500
  `.trim();

  const response = await querySparql(query);
  if (!response || !response.results.bindings.length) {
    console.log('  No directives found.');
    return [];
  }

  console.log(`  Found ${response.results.bindings.length} results.`);
  const documents: EUDocumentSeed[] = [];

  for (const binding of response.results.bindings) {
    const celex = binding.celex?.value;
    if (!celex) continue;

    const parsed = parseCelex(celex);
    const id = generateDocumentId(parsed);
    if (!id || parsed.type !== 'directive') continue;

    const doc: EUDocumentSeed = {
      id,
      type: 'directive',
      year: parsed.year!,
      number: parsed.number!,
      community: parsed.community,
      celex_number: celex,
      title: binding.title?.value,
      title_nl: binding.titleNL?.value,
      adoption_date: formatDate(binding.date?.value || ''),
      in_force: binding.inForce?.value === 'true' ? 1 : 0,
      url_eur_lex: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`,
    };

    documents.push(doc);
  }

  console.log(`  Parsed ${documents.length} directives.`);
  return documents;
}

/**
 * Fetch EU regulations from EUR-Lex.
 */
async function fetchRegulations(): Promise<EUDocumentSeed[]> {
  console.log('Fetching EU regulations...');

  const query = `
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?work ?celex ?title ?titleNL ?date ?inForce WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_date_document ?date .
  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce }
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?expr cdm:expression_title ?title .
  OPTIONAL {
    ?exprNL cdm:expression_belongs_to_work ?work .
    ?exprNL cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/NLD> .
    ?exprNL cdm:expression_title ?titleNL .
  }
  FILTER(STRSTARTS(?celex, "3"))
  FILTER(CONTAINS(?celex, "R"))
  FILTER(YEAR(?date) >= ${MIN_YEAR})
}
ORDER BY DESC(?date)
LIMIT 500
  `.trim();

  const response = await querySparql(query);
  if (!response || !response.results.bindings.length) {
    console.log('  No regulations found.');
    return [];
  }

  console.log(`  Found ${response.results.bindings.length} results.`);
  const documents: EUDocumentSeed[] = [];

  for (const binding of response.results.bindings) {
    const celex = binding.celex?.value;
    if (!celex) continue;

    const parsed = parseCelex(celex);
    const id = generateDocumentId(parsed);
    if (!id || parsed.type !== 'regulation') continue;

    const doc: EUDocumentSeed = {
      id,
      type: 'regulation',
      year: parsed.year!,
      number: parsed.number!,
      community: parsed.community,
      celex_number: celex,
      title: binding.title?.value,
      title_nl: binding.titleNL?.value,
      adoption_date: formatDate(binding.date?.value || ''),
      in_force: binding.inForce?.value === 'true' ? 1 : 0,
      url_eur_lex: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`,
    };

    documents.push(doc);
  }

  console.log(`  Parsed ${documents.length} regulations.`);
  return documents;
}

/**
 * Write seed file.
 */
function writeSeedFile(filename: string, documents: EUDocumentSeed[]): void {
  const filePath = path.join(SEED_DIR, filename);
  const data = {
    eu_documents: documents,
  };

  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  Wrote ${documents.length} documents to ${filename}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== EUR-Lex Metadata Fetcher ===');
  console.log();
  console.log(`Fetching EU legislation from ${MIN_YEAR} onwards...`);
  console.log();

  try {
    // Fetch directives
    const directives = await fetchDirectives();
    if (directives.length > 0) {
      writeSeedFile('eurlex-directives.json', directives);
    }

    // Rate limit between requests
    console.log();
    console.log(`Waiting ${RATE_LIMIT_MS}ms before next request...`);
    await sleep(RATE_LIMIT_MS);
    console.log();

    // Fetch regulations
    const regulations = await fetchRegulations();
    if (regulations.length > 0) {
      writeSeedFile('eurlex-regulations.json', regulations);
    }

    console.log();
    console.log('=== Summary ===');
    console.log(`  Directives:  ${directives.length}`);
    console.log(`  Regulations: ${regulations.length}`);
    console.log(`  Total:       ${directives.length + regulations.length}`);
    console.log();
    console.log('Done.');
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

main();
