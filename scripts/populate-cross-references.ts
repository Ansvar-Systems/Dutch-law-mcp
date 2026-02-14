#!/usr/bin/env tsx
/**
 * Populate cross_references table by extracting references from provision content.
 *
 * Reads all rows in legal_provisions, runs the cross-ref extractor on each
 * provision's content, resolves target documents, and inserts the results
 * into the cross_references table (INSERT OR IGNORE for dedup).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from '@ansvar/mcp-sqlite';
import { extractCrossReferences } from '../src/parsers/cross-ref-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// BW book mapping – The Burgerlijk Wetboek is split across several BWB-IDs.
// Book numbers map to specific BWB identifiers.
// ---------------------------------------------------------------------------
const BW_BOOK_TO_BWB: Record<number, string> = {
  1: 'BWBR0002656', // Boek 1 – Personen- en familierecht (old numbering, often BWBR0005289 covers 1-8)
  2: 'BWBR0003045', // Boek 2 – Rechtspersonen
  3: 'BWBR0005291', // Boek 3 – Vermogensrecht
  4: 'BWBR0005290', // Boek 4 – Erfrecht
  5: 'BWBR0005288', // Boek 5 – Zakelijke rechten
  6: 'BWBR0005289', // Boek 6 – Verbintenissenrecht
  7: 'BWBR0005290', // Boek 7 – Bijzondere overeenkomsten
  8: 'BWBR0005034', // Boek 8 – Verkeersmiddelen en vervoer
  10: 'BWBR0012009', // Boek 10 – IPR
};

// All possible BW BWB-IDs (used when we can't determine the book)
const BW_BWB_IDS = [
  'BWBR0005289',
  'BWBR0005290',
  'BWBR0005291',
  'BWBR0003045',
];

// Short name -> BWB-ID mapping for non-BW statutes
const SHORT_NAME_TO_BWB: Record<string, string> = {
  Sr: 'BWBR0001854',
  Sv: 'BWBR0001903',
  Awb: 'BWBR0005537',
  Gw: 'BWBR0001840',
  Rv: 'BWBR0001827',
  Fw: 'BWBR0001860',
  WvK: 'BWBR0001838',
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dbPath = join(__dirname, '..', 'data', 'database.db');
  const db = new Database(dbPath);

  // Build a set of known document IDs for quick existence checks
  const knownDocs = new Set<string>();
  const docRows = db.prepare('SELECT id FROM legal_documents').all() as Array<{ id: string }>;
  for (const row of docRows) {
    knownDocs.add(row.id);
  }
  console.log(`Loaded ${knownDocs.size} known legal documents.`);

  // Read all provisions
  const provisions = db.prepare(
    'SELECT id, document_id, provision_ref, content FROM legal_provisions',
  ).all() as Array<{
    id: number;
    document_id: string;
    provision_ref: string;
    content: string;
  }>;
  console.log(`Found ${provisions.length} provisions to process.`);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO cross_references
      (source_document_id, source_provision_ref, target_document_id, target_provision_ref, ref_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  let totalRefs = 0;
  let skippedRefs = 0;

  // Wrap all inserts in a single transaction for performance
  const insertAll = db.transaction(() => {
    for (let i = 0; i < provisions.length; i++) {
      const provision = provisions[i];

      if (!provision.content) continue;

      const refs = extractCrossReferences(provision.content);

      for (const ref of refs) {
        const targetDocIds = resolveTargetDocumentIds(ref, knownDocs, provision.document_id);

        if (targetDocIds.length === 0) {
          skippedRefs++;
          continue;
        }

        for (const targetDocId of targetDocIds) {
          // Skip trivial self-references (same doc, same provision)
          if (targetDocId === provision.document_id && ref.target_provision_ref === provision.provision_ref) {
            continue;
          }
          insertStmt.run(
            provision.document_id,
            provision.provision_ref,
            targetDocId,
            ref.target_provision_ref ?? null,
            'references',
          );
          totalRefs++;
        }
      }

      // Progress reporting every 1000 provisions
      if ((i + 1) % 1000 === 0) {
        console.log(`  Processed ${i + 1} / ${provisions.length} provisions (${totalRefs} refs so far)...`);
      }
    }
  });

  insertAll();

  console.log(`\nDone.`);
  console.log(`  Total cross-references inserted: ${totalRefs}`);
  console.log(`  Skipped (target not in database): ${skippedRefs}`);

  db.close();
}

// ---------------------------------------------------------------------------
// Resolve an extracted reference to zero or more target document IDs
// ---------------------------------------------------------------------------
interface ExtractedRef {
  target_bwb_id?: string;
  target_provision_ref?: string;
  target_short_name?: string;
  raw_text: string;
}

function resolveTargetDocumentIds(
  ref: ExtractedRef,
  knownDocs: Set<string>,
  sourceDocumentId: string,
): string[] {
  // 1. Direct BWB-ID (and it's not a BW short-name reference that we handle below)
  if (ref.target_bwb_id && ref.target_short_name !== 'BW') {
    if (knownDocs.has(ref.target_bwb_id)) {
      return [ref.target_bwb_id];
    }
    return [];
  }

  // 2. BW references – try to determine the book from provision_ref
  if (ref.target_short_name === 'BW') {
    return resolveBwReference(ref, knownDocs);
  }

  // 3. Non-BW short name
  if (ref.target_short_name && SHORT_NAME_TO_BWB[ref.target_short_name]) {
    const bwbId = SHORT_NAME_TO_BWB[ref.target_short_name];
    if (knownDocs.has(bwbId)) {
      return [bwbId];
    }
    return [];
  }

  // 4. Bare BWB-ID without short name (e.g. inline BWBR references)
  if (ref.target_bwb_id) {
    if (knownDocs.has(ref.target_bwb_id)) {
      return [ref.target_bwb_id];
    }
    return [];
  }

  // 5. Plain article reference with no short name and no BWB –
  //    treat as internal self-reference within the same statute
  if (ref.target_provision_ref) {
    return [sourceDocumentId];
  }

  return [];
}

function resolveBwReference(
  ref: ExtractedRef,
  knownDocs: Set<string>,
): string[] {
  // Attempt to extract book number from provision_ref (e.g. "6:162" -> book 6)
  if (ref.target_provision_ref) {
    const bookMatch = ref.target_provision_ref.match(/^(\d+):/);
    if (bookMatch) {
      const bookNum = parseInt(bookMatch[1], 10);

      // Try the specific book mapping first
      if (BW_BOOK_TO_BWB[bookNum]) {
        const bwbId = BW_BOOK_TO_BWB[bookNum];
        if (knownDocs.has(bwbId)) {
          return [bwbId];
        }
      }

      // Fall through: try all BW BWB-IDs and return the first that exists
      for (const bwbId of BW_BWB_IDS) {
        if (knownDocs.has(bwbId)) {
          return [bwbId];
        }
      }
      return [];
    }
  }

  // If the extractor already set a BWB-ID, check if it exists
  if (ref.target_bwb_id && knownDocs.has(ref.target_bwb_id)) {
    return [ref.target_bwb_id];
  }

  // No book number determinable – try all BW BWB-IDs, return first match
  for (const bwbId of BW_BWB_IDS) {
    if (knownDocs.has(bwbId)) {
      return [bwbId];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
