#!/usr/bin/env tsx
/**
 * EUR-Lex document importer.
 *
 * Reads already-ingested BWB statute seed files from data/seed/, scans their
 * provision text for EU references, and writes eu_references seed data linking
 * Dutch provisions to EU documents.
 *
 * Usage: npm run import:eurlex-documents
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractEUReferences } from '../src/parsers/eu-reference-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');

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

interface DocumentSeed {
  id: string;
  type: string;
  title: string;
  title_en?: string;
  short_name?: string;
  status?: string;
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
}

interface BWBSeedFile {
  documents?: DocumentSeed[];
  provisions?: ProvisionSeed[];
}

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

interface EUReferenceSeed {
  source_type: string;
  source_id: string;
  document_id: string;
  provision_id?: number;
  eu_document_id: string;
  eu_article?: string;
  reference_type: string;
  reference_context?: string;
  full_citation?: string;
  is_primary_implementation?: number;
  implementation_status?: string;
}

interface EURLexSeedOutput {
  eu_documents: EUDocumentSeed[];
  eu_references: EUReferenceSeed[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate EU document ID from extracted reference.
 */
function generateEUDocumentId(
  type: 'directive' | 'regulation',
  year: number,
  number: number,
  community?: string,
): string {
  return `${type}-${year}-${number}-${community || 'EU'}`;
}

/**
 * Extract context (up to 100 chars) around a match position in text.
 */
function extractContext(text: string, matchPosition: number, maxLength = 100): string {
  const start = Math.max(0, matchPosition - 50);
  const end = Math.min(text.length, matchPosition + 50);
  let context = text.slice(start, end).trim();

  // Truncate to maxLength if needed
  if (context.length > maxLength) {
    context = context.slice(0, maxLength) + '...';
  }

  return context;
}

/**
 * Read and parse a BWB seed file.
 */
function readBWBSeedFile(filePath: string): BWBSeedFile | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as BWBSeedFile;
    return data;
  } catch (error) {
    console.error(
      `  Error reading ${path.basename(filePath)}:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await Promise.resolve();
  console.log('=== EUR-Lex Document Importer ===');
  console.log();

  // Seed directory only exists after the BWB ingestion step has run. In CI
  // we may run build:db without ingestion (PR validation just exercises the
  // build pipeline); treat missing seed as "nothing to do" rather than
  // a hard failure so unrelated PRs don't trip on it.
  if (!fs.existsSync(SEED_DIR)) {
    console.log(`Seed directory does not exist: ${SEED_DIR}`);
    console.log('Skipping EU-reference extraction (no BWB seeds to scan).');
    return;
  }

  // Find all BWB seed files
  const allFiles = fs.readdirSync(SEED_DIR);
  const bwbFiles = allFiles.filter((f) => f.startsWith('BWB') && f.endsWith('.json'));

  if (bwbFiles.length === 0) {
    console.log('No BWB seed files found. Run the BWB ingestion script first.');
    console.log('Usage: npm run ingest');
    process.exit(0);
  }

  console.log(`Found ${bwbFiles.length} BWB seed file(s)`);
  console.log();

  // Maps to collect unique EU documents and references
  const euDocumentsMap = new Map<string, EUDocumentSeed>();
  const euReferences: EUReferenceSeed[] = [];

  let totalFilesScanned = 0;
  let totalProvisionsScanned = 0;
  let totalReferencesFound = 0;
  let filesWithErrors = 0;

  // Process each BWB seed file
  for (const fileName of bwbFiles) {
    const filePath = path.join(SEED_DIR, fileName);
    const seedData = readBWBSeedFile(filePath);

    if (!seedData) {
      filesWithErrors++;
      continue;
    }

    totalFilesScanned++;

    // Skip if no provisions
    if (!seedData.provisions || seedData.provisions.length === 0) {
      continue;
    }

    const documentId = seedData.documents?.[0]?.id || fileName.replace('.json', '');

    console.log(`Processing ${fileName} (${seedData.provisions.length} provisions)...`);

    // Process each provision
    for (const provision of seedData.provisions) {
      totalProvisionsScanned++;

      // Extract EU references from provision content
      const references = extractEUReferences(provision.content);

      for (const ref of references) {
        totalReferencesFound++;

        // Generate EU document ID
        const euDocId = generateEUDocumentId(ref.type, ref.year, ref.number, ref.community);

        // Add EU document to map (deduplicate)
        if (!euDocumentsMap.has(euDocId)) {
          euDocumentsMap.set(euDocId, {
            id: euDocId,
            type: ref.type,
            year: ref.year,
            number: ref.number,
            community: ref.community || 'EU',
            in_force: 1,
          });
        }

        // Find match position for context extraction
        const matchIndex = provision.content.indexOf(ref.raw_match);
        const context =
          matchIndex >= 0
            ? extractContext(provision.content, matchIndex)
            : provision.content.slice(0, 100);

        // Create EU reference
        euReferences.push({
          source_type: 'provision',
          source_id: provision.provision_ref,
          document_id: documentId,
          eu_document_id: euDocId,
          eu_article: ref.article,
          reference_type: ref.reference_type,
          reference_context: context,
          full_citation: ref.raw_match,
          is_primary_implementation: ref.reference_type === 'implements' ? 1 : 0,
          implementation_status: 'unknown',
        });
      }
    }
  }

  console.log();
  console.log('=== Summary ===');
  console.log(`Files scanned:        ${totalFilesScanned}`);
  console.log(`Files with errors:    ${filesWithErrors}`);
  console.log(`Provisions scanned:   ${totalProvisionsScanned}`);
  console.log(`EU references found:  ${totalReferencesFound}`);
  console.log(`Unique EU documents:  ${euDocumentsMap.size}`);
  console.log();

  // Write output seed file
  const outputData: EURLexSeedOutput = {
    eu_documents: Array.from(euDocumentsMap.values()),
    eu_references: euReferences,
  };

  const outputPath = path.join(SEED_DIR, 'eurlex-references.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

  console.log(`Wrote EUR-Lex references to: ${outputPath}`);
  console.log('Done!');
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
