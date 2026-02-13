#!/usr/bin/env tsx
/**
 * Legal term definition extractor.
 *
 * Scans provisions in seed files for definition patterns (e.g.,
 * "wordt verstaan onder:", "begripsbepalingen") and extracts
 * structured term/definition pairs.
 *
 * Usage: npm run extract:definitions
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');
const OUTPUT_FILE = path.resolve(SEED_DIR, 'definitions.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProvisionSeed {
  document_id: string;
  provision_ref: string;
  book?: string;
  chapter?: string;
  section?: string;
  article: string;
  title?: string;
  content: string;
  metadata?: string;
}

interface SeedFile {
  documents?: unknown[];
  provisions?: ProvisionSeed[];
  [key: string]: unknown;
}

interface DefinitionSeed {
  document_id: string;
  term: string;
  term_en?: string;
  definition: string;
  source_provision?: string;
}

interface DefinitionOutput {
  definitions: DefinitionSeed[];
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// Match definition article headers
const DEFINITION_HEADER = /(?:wordt\s+verstaan\s+onder|begripsbepalingen|definities)/i;

// Match lettered items: "a. term: definition text;"
// Handles both lowercase (a-z) and uppercase (A-Z) letters
const LETTERED_ITEM = /^([a-z])\.\s*([^:]+?):\s*(.+?)(?:;|$)/gim;

// Match individual inline definitions with various quote styles
const INLINE_DEFINITION = /(?:onder|met)\s+[""«]([^""»]+)[""»]\s+wordt.*?verstaan:?\s*(.+?)(?:[.;]|$)/gi;

// Match alternative format: "verordening: Verordening (EU)..."
const COLON_DEFINITION = /^([a-zA-Z][a-zA-Z\s]+?):\s*(.+?)(?:;|$)/gm;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Clean extracted terms - remove trailing colons, normalize whitespace
 */
function cleanTerm(term: string): string {
  return term
    .trim()
    .replace(/:\s*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[""]|[""]$/g, '');
}

/**
 * Clean extracted definitions - normalize whitespace, remove trailing punctuation
 */
function cleanDefinition(definition: string): string {
  return definition
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[;.]$/, '');
}

/**
 * Check if a provision is likely a definition article
 */
function isDefinitionProvision(provision: ProvisionSeed): boolean {
  const titleMatch = provision.title && DEFINITION_HEADER.test(provision.title);
  const contentMatch = DEFINITION_HEADER.test(provision.content);
  return !!(titleMatch || contentMatch);
}

/**
 * Extract definitions from lettered list format (a., b., c.)
 */
function extractLetteredDefinitions(
  content: string,
  documentId: string,
  provisionRef: string,
): DefinitionSeed[] {
  const definitions: DefinitionSeed[] = [];
  const matches = content.matchAll(LETTERED_ITEM);

  for (const match of matches) {
    const term = cleanTerm(match[2]);
    const definition = cleanDefinition(match[3]);

    if (term && definition && definition.length > 3) {
      definitions.push({
        document_id: documentId,
        term,
        definition,
        source_provision: provisionRef,
      });
    }
  }

  return definitions;
}

/**
 * Extract definitions from colon-separated format
 */
function extractColonDefinitions(
  content: string,
  documentId: string,
  provisionRef: string,
): DefinitionSeed[] {
  const definitions: DefinitionSeed[] = [];

  // Only try this pattern if "wordt verstaan onder" is present
  if (!content.match(/wordt\s+verstaan\s+onder/i)) {
    return definitions;
  }

  const matches = content.matchAll(COLON_DEFINITION);

  for (const match of matches) {
    const term = cleanTerm(match[1]);
    const definition = cleanDefinition(match[2]);

    // Filter out false positives
    if (
      term &&
      definition &&
      definition.length > 10 &&
      term.length < 100 &&
      !term.match(/^(in|voor|bij|door|met|van|op|artikel|lid)/i)
    ) {
      definitions.push({
        document_id: documentId,
        term,
        definition,
        source_provision: provisionRef,
      });
    }
  }

  return definitions;
}

/**
 * Extract definitions from inline format (quoted terms)
 */
function extractInlineDefinitions(
  content: string,
  documentId: string,
  provisionRef: string,
): DefinitionSeed[] {
  const definitions: DefinitionSeed[] = [];
  const matches = content.matchAll(INLINE_DEFINITION);

  for (const match of matches) {
    const term = cleanTerm(match[1]);
    const definition = cleanDefinition(match[2]);

    if (term && definition && definition.length > 3) {
      definitions.push({
        document_id: documentId,
        term,
        definition,
        source_provision: provisionRef,
      });
    }
  }

  return definitions;
}

/**
 * Extract all definitions from a provision
 */
function extractDefinitionsFromProvision(provision: ProvisionSeed): DefinitionSeed[] {
  const definitions: DefinitionSeed[] = [];

  if (!isDefinitionProvision(provision)) {
    return definitions;
  }

  // Try lettered list format first (most common)
  const letteredDefs = extractLetteredDefinitions(
    provision.content,
    provision.document_id,
    provision.provision_ref,
  );

  if (letteredDefs.length > 0) {
    definitions.push(...letteredDefs);
  } else {
    // Try colon-separated format
    const colonDefs = extractColonDefinitions(
      provision.content,
      provision.document_id,
      provision.provision_ref,
    );
    definitions.push(...colonDefs);
  }

  // Always check for inline definitions
  const inlineDefs = extractInlineDefinitions(
    provision.content,
    provision.document_id,
    provision.provision_ref,
  );
  definitions.push(...inlineDefs);

  return definitions;
}

/**
 * Read and filter BWB seed files from the seed directory
 */
function readBWBSeedFiles(): SeedFile[] {
  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed directory found at ${SEED_DIR}`);
    return [];
  }

  const files = fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const seeds: SeedFile[] = [];

  for (const file of files) {
    // Skip case law and other non-statute files
    if (file.startsWith('rechtspraak-') || file === 'definitions.json') {
      continue;
    }

    const filePath = path.join(SEED_DIR, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SeedFile;

      // Only process files with provisions
      if (parsed.provisions && parsed.provisions.length > 0) {
        seeds.push(parsed);
        console.log(`  Read ${file} (${parsed.provisions.length} provisions)`);
      }
    } catch (err) {
      console.error(`  WARNING: Failed to parse ${file}: ${err}`);
    }
  }

  return seeds;
}

/**
 * Deduplicate definitions by document_id + term
 */
function deduplicateDefinitions(definitions: DefinitionSeed[]): DefinitionSeed[] {
  const seen = new Set<string>();
  const deduplicated: DefinitionSeed[] = [];

  for (const def of definitions) {
    const key = `${def.document_id}:${def.term.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(def);
    }
  }

  return deduplicated;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('=== Legal Term Definition Extractor ===');
  console.log();

  console.log('Reading seed files...');
  const seeds = readBWBSeedFiles();

  if (seeds.length === 0) {
    console.log('No BWB seed files found with provisions.');
    console.log('Skipping definition extraction.');
    return;
  }

  console.log();
  console.log('Extracting definitions...');

  const allDefinitions: DefinitionSeed[] = [];
  let filesScanned = 0;
  let provisionsScanned = 0;
  let definitionProvisionsFound = 0;

  for (const seed of seeds) {
    filesScanned++;

    if (!seed.provisions) {
      continue;
    }

    for (const provision of seed.provisions) {
      provisionsScanned++;

      if (isDefinitionProvision(provision)) {
        definitionProvisionsFound++;
        const definitions = extractDefinitionsFromProvision(provision);

        if (definitions.length > 0) {
          console.log(
            `  Found ${definitions.length} definitions in ${provision.document_id} ${provision.provision_ref}`,
          );
          allDefinitions.push(...definitions);
        }
      }
    }
  }

  // Deduplicate
  const uniqueDefinitions = deduplicateDefinitions(allDefinitions);

  console.log();
  console.log('Summary:');
  console.log(`  Files scanned:               ${filesScanned}`);
  console.log(`  Provisions scanned:          ${provisionsScanned}`);
  console.log(`  Definition provisions found: ${definitionProvisionsFound}`);
  console.log(`  Definitions extracted:       ${allDefinitions.length}`);
  console.log(`  Unique definitions:          ${uniqueDefinitions.length}`);

  // Sort definitions by document_id and term
  uniqueDefinitions.sort((a, b) => {
    if (a.document_id !== b.document_id) {
      return a.document_id.localeCompare(b.document_id);
    }
    return a.term.localeCompare(b.term);
  });

  // Write output
  const output: DefinitionOutput = {
    definitions: uniqueDefinitions,
  };

  console.log();
  console.log(`Writing definitions to ${OUTPUT_FILE}...`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log('Done.');
}

main();
