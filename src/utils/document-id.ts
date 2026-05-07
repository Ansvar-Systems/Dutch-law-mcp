/**
 * Document ID resolution for Dutch Law MCP.
 *
 * Resolves fuzzy document references (titles, short names, BWB-IDs) to database document IDs.
 * 6-step cascade: direct ID -> short name/abbreviation -> exact title match
 *   -> exact title match ignoring year -> LIKE shortest match -> punctuation-normalized scan.
 */

import type { Database } from '@ansvar/mcp-sqlite';

/** Well-known abbreviations and short-form names for Dutch statutes. */
const ABBREVIATIONS: Record<string, string> = {
  BW: 'BWBR0005289',
  SR: 'BWBR0001854',
  SV: 'BWBR0001903',
  AWB: 'BWBR0005537',
  GW: 'BWBR0001840',
  FW: 'BWBR0001860',
  WVK: 'BWBR0001838',
  RV: 'BWBR0001827',
  WFT: 'BWBR0020368',
  WM: 'BWBR0003245',
  WOR: 'BWBR0002747',
  WVW: 'BWBR0006622',
  UAVG: 'BWBR0040940',
  AVG: 'BWBR0040940',
  GDPR: 'BWBR0040940',
  WBP: 'BWBR0011823',
  // Step-4 LIKE-shortest matching otherwise picks the wrong BWB-ID for these
  // because production has multiple statutes whose title contains the short
  // name (amendments, implementation acts). Pin them to the canonical entry.
  AUTEURSWET: 'BWBR0001886',
};

/**
 * Strip punctuation that commonly differs between user input and stored titles.
 */
function normalizePunctuation(s: string): string {
  return s
    .replace(/[,;:.()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a document identifier to a database document ID.
 * Handles BWB-IDs, abbreviations (BW, Sr, Awb), full titles,
 * and partial matches with shortest-title ranking.
 */
export function resolveDocumentId(db: Database, input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Step 1: Direct ID match (BWB-ID like BWBR0005289)
  const directMatch = db.prepare('SELECT id FROM legal_documents WHERE id = ?').get(trimmed) as
    | { id: string }
    | undefined;
  if (directMatch) return directMatch.id;

  // Step 2: Abbreviation / short name map (case-insensitive)
  const abbr = ABBREVIATIONS[trimmed.toUpperCase()];
  if (abbr) {
    const abbrCheck = db.prepare('SELECT id FROM legal_documents WHERE id = ?').get(abbr) as
      | { id: string }
      | undefined;
    if (abbrCheck) return abbrCheck.id;
  }

  // Also try the short_name column directly
  const shortNameMatch = db
    .prepare('SELECT id FROM legal_documents WHERE LOWER(short_name) = LOWER(?)')
    .get(trimmed) as { id: string } | undefined;
  if (shortNameMatch) return shortNameMatch.id;

  // Step 3: Exact title match (case-insensitive)
  const trimmedLower = trimmed.toLowerCase();
  {
    const allDocs = db
      .prepare('SELECT id, title, title_en, short_name FROM legal_documents')
      .all() as { id: string; title: string; title_en: string | null; short_name: string | null }[];

    // 3a: Exact match on full title
    const exactFull = allDocs.find(
      (d) =>
        d.title.toLowerCase() === trimmedLower ||
        d.title_en?.toLowerCase() === trimmedLower ||
        d.short_name?.toLowerCase() === trimmedLower,
    );
    if (exactFull) return exactFull.id;

    // 3b: Exact match after stripping trailing year from stored title
    const exactNoYear = allDocs.find((d) => {
      const stripped = d.title.replace(/,?\s+\d{4}\s*$/, '').trim();
      return stripped.toLowerCase() === trimmedLower;
    });
    if (exactNoYear) return exactNoYear.id;
  }

  // Step 4: Substring LIKE — pick shortest matching title
  {
    const likeRows = db
      .prepare(
        'SELECT id, title FROM legal_documents WHERE title LIKE ? OR short_name LIKE ? OR title_en LIKE ?',
      )
      .all(`%${trimmed}%`, `%${trimmed}%`, `%${trimmed}%`) as { id: string; title: string }[];
    if (likeRows.length > 0) {
      likeRows.sort((a, b) => a.title.length - b.title.length);
      return likeRows[0].id;
    }
  }

  // Step 5: Case-insensitive LIKE — shortest match
  {
    const lowerRows = db
      .prepare(
        'SELECT id, title FROM legal_documents WHERE LOWER(title) LIKE LOWER(?) OR LOWER(short_name) LIKE LOWER(?) OR LOWER(title_en) LIKE LOWER(?)',
      )
      .all(`%${trimmed}%`, `%${trimmed}%`, `%${trimmed}%`) as { id: string; title: string }[];
    if (lowerRows.length > 0) {
      lowerRows.sort((a, b) => a.title.length - b.title.length);
      return lowerRows[0].id;
    }
  }

  // Step 6: Punctuation-normalized full scan — shortest match
  {
    const stripped = normalizePunctuation(trimmed);
    const strippedLower = stripped.toLowerCase();
    const allDocs = db
      .prepare('SELECT id, title, title_en, short_name FROM legal_documents')
      .all() as { id: string; title: string; title_en: string | null; short_name: string | null }[];

    const matches: { id: string; titleLen: number }[] = [];
    for (const doc of allDocs) {
      const fields = [doc.title, doc.title_en, doc.short_name].filter(Boolean) as string[];
      for (const field of fields) {
        if (normalizePunctuation(field).toLowerCase().includes(strippedLower)) {
          matches.push({ id: doc.id, titleLen: doc.title.length });
          break;
        }
      }
    }
    if (matches.length > 0) {
      matches.sort((a, b) => a.titleLen - b.titleLen);
      return matches[0].id;
    }
  }

  // Resolution failed
  return null;
}
