/**
 * Parser for Dutch legal amendment references
 *
 * Extracts amendment information from Dutch legal provision text, including:
 * - Staatsblad references (official publication references)
 * - Amendment types (gewijzigd, vervallen, ingetrokken, ingevoegd)
 * - BWB-ID references
 * - Effective dates
 */

export interface AmendmentReference {
  /** Staatsblad reference if found, e.g. "2021, 123" */
  staatsblad_ref?: string;
  /** BWB-ID of amending statute if found */
  amended_by_bwb?: string;
  /** Type of amendment */
  amendment_type: 'gewijzigd' | 'vervallen' | 'ingetrokken' | 'ingevoegd' | 'nieuw';
  /** Position in text where reference was found */
  position: 'suffix' | 'inline' | 'header';
  /** Raw text fragment containing the reference */
  raw_text: string;
}

export interface ProvisionAmendment {
  provision_ref: string;
  amendments: AmendmentReference[];
}

/**
 * Dutch month names for date extraction
 */
const DUTCH_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'
];

/**
 * Patterns for detecting amendments in Dutch legal text
 */
const AMENDMENT_PATTERNS = {
  // "Gewijzigd bij wet van [date], Stb. YYYY, NNN"
  gewijzigd: /(?:Gewijzigd|gewijzigd)\s+bij\s+(?:wet|besluit|regeling)\s+van\s+[^,]+,?\s*Stb\.?\s+(\d{4}),?\s+(\d+)/gi,

  // "Laatstelijk gewijzigd bij Stb. YYYY, NNN"
  laatstelijk: /Laatstelijk\s+gewijzigd\s+bij\s+Stb\.?\s+(\d{4}),?\s+(\d+)/gi,

  // "Vervallen per [date]"
  vervallen: /(?:Vervallen|vervallen)\s+per\s+(\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4})/gi,

  // "Ingetrokken bij wet van [date], Stb. YYYY, NNN"
  ingetrokken: /(?:Ingetrokken|ingetrokken)\s+bij\s+(?:wet|besluit|regeling)\s+van\s+[^,]+,?\s*Stb\.?\s+(\d{4}),?\s+(\d+)/gi,

  // "Ingevoegd bij wet van [date], Stb. YYYY, NNN"
  ingevoegd: /(?:Ingevoegd|ingevoegd)\s+bij\s+(?:wet|besluit|regeling)\s+van\s+[^,]+,?\s*Stb\.?\s+(\d{4}),?\s+(\d+)/gi,

  // Generic "Stb. YYYY, NNN" reference
  staatsblad: /Stb\.?\s+(\d{4}),?\s+(\d+)/gi,

  // BWB-ID reference
  bwb: /BWBR\d{7}/gi
};

/**
 * Extract all amendment references from a text
 */
export function extractAmendmentReferences(content: string): AmendmentReference[] {
  const amendments: AmendmentReference[] = [];
  const processedRefs = new Set<string>();

  // Check for "gewijzigd bij" amendments
  let match: RegExpExecArray | null;
  AMENDMENT_PATTERNS.gewijzigd.lastIndex = 0;
  while ((match = AMENDMENT_PATTERNS.gewijzigd.exec(content)) !== null) {
    const staatsblad_ref = `${match[1]}, ${match[2]}`;
    const key = `gewijzigd-${staatsblad_ref}`;

    if (!processedRefs.has(key)) {
      processedRefs.add(key);
      amendments.push({
        staatsblad_ref,
        amendment_type: 'gewijzigd',
        position: determinePosition(content, match.index),
        raw_text: match[0]
      });
    }
  }

  // Check for "laatstelijk gewijzigd bij" amendments
  AMENDMENT_PATTERNS.laatstelijk.lastIndex = 0;
  while ((match = AMENDMENT_PATTERNS.laatstelijk.exec(content)) !== null) {
    const staatsblad_ref = `${match[1]}, ${match[2]}`;
    const key = `gewijzigd-${staatsblad_ref}`;

    if (!processedRefs.has(key)) {
      processedRefs.add(key);
      amendments.push({
        staatsblad_ref,
        amendment_type: 'gewijzigd',
        position: determinePosition(content, match.index),
        raw_text: match[0]
      });
    }
  }

  // Check for "vervallen per" expirations
  AMENDMENT_PATTERNS.vervallen.lastIndex = 0;
  while ((match = AMENDMENT_PATTERNS.vervallen.exec(content)) !== null) {
    const key = `vervallen-${match[0]}`;

    if (!processedRefs.has(key)) {
      processedRefs.add(key);
      amendments.push({
        amendment_type: 'vervallen',
        position: determinePosition(content, match.index),
        raw_text: match[0]
      });
    }
  }

  // Check for "ingetrokken bij" withdrawals
  AMENDMENT_PATTERNS.ingetrokken.lastIndex = 0;
  while ((match = AMENDMENT_PATTERNS.ingetrokken.exec(content)) !== null) {
    const staatsblad_ref = `${match[1]}, ${match[2]}`;
    const key = `ingetrokken-${staatsblad_ref}`;

    if (!processedRefs.has(key)) {
      processedRefs.add(key);
      amendments.push({
        staatsblad_ref,
        amendment_type: 'ingetrokken',
        position: determinePosition(content, match.index),
        raw_text: match[0]
      });
    }
  }

  // Check for "ingevoegd bij" insertions
  AMENDMENT_PATTERNS.ingevoegd.lastIndex = 0;
  while ((match = AMENDMENT_PATTERNS.ingevoegd.exec(content)) !== null) {
    const staatsblad_ref = `${match[1]}, ${match[2]}`;
    const key = `ingevoegd-${staatsblad_ref}`;

    if (!processedRefs.has(key)) {
      processedRefs.add(key);
      amendments.push({
        staatsblad_ref,
        amendment_type: 'ingevoegd',
        position: determinePosition(content, match.index),
        raw_text: match[0]
      });
    }
  }

  // Check for BWB-ID references
  AMENDMENT_PATTERNS.bwb.lastIndex = 0;
  while ((match = AMENDMENT_PATTERNS.bwb.exec(content)) !== null) {
    const bwb_id = match[0];
    const key = `bwb-${bwb_id}`;

    if (!processedRefs.has(key)) {
      processedRefs.add(key);

      // Try to determine amendment type from context
      const contextBefore = content.substring(Math.max(0, match.index - 50), match.index);
      let amendmentType: AmendmentReference['amendment_type'] = 'nieuw';

      if (/gewijzigd/i.test(contextBefore)) {
        amendmentType = 'gewijzigd';
      } else if (/ingetrokken/i.test(contextBefore)) {
        amendmentType = 'ingetrokken';
      } else if (/ingevoegd/i.test(contextBefore)) {
        amendmentType = 'ingevoegd';
      } else if (/vervallen/i.test(contextBefore)) {
        amendmentType = 'vervallen';
      }

      amendments.push({
        amended_by_bwb: bwb_id,
        amendment_type: amendmentType,
        position: determinePosition(content, match.index),
        raw_text: match[0]
      });
    }
  }

  return amendments;
}

/**
 * Parse amendments for multiple provisions
 */
export function parseStatuteAmendments(
  provisions: Array<{ provision_ref: string; content: string }>
): ProvisionAmendment[] {
  return provisions.map(prov => ({
    provision_ref: prov.provision_ref,
    amendments: extractAmendmentReferences(prov.content)
  }));
}

/**
 * Validate a Staatsblad reference format
 */
export function isValidStaatsbladRef(ref: string): boolean {
  // Should be in format "YYYY, NNN" or "YYYY,NNN"
  const pattern = /^\d{4},?\s*\d+$/;
  return pattern.test(ref);
}

/**
 * Normalize a Staatsblad reference to standard format "YYYY, NNN"
 */
export function normalizeStaatsbladRef(ref: string): string | null {
  const match = ref.match(/(\d{4}),?\s*(\d+)/);
  if (!match) {
    return null;
  }
  return `${match[1]}, ${match[2]}`;
}

/**
 * Extract effective date from Dutch text
 * Returns date in ISO format (YYYY-MM-DD) if found
 */
export function extractEffectiveDate(text: string): string | null {
  // Pattern: "DD maand YYYY" or "D maand YYYY"
  const datePattern = /(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i;
  const match = text.match(datePattern);

  if (!match) {
    return null;
  }

  const day = match[1].padStart(2, '0');
  const monthName = match[2].toLowerCase();
  const year = match[3];

  const monthIndex = DUTCH_MONTHS.indexOf(monthName);
  if (monthIndex === -1) {
    return null;
  }

  const month = (monthIndex + 1).toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Determine position of amendment reference in text
 */
function determinePosition(content: string, index: number): 'suffix' | 'inline' | 'header' {
  const lines = content.substring(0, index).split('\n');
  const currentLine = lines[lines.length - 1];

  // If at the beginning of the text (first 100 chars), it's likely a header
  if (index < 100) {
    return 'header';
  }

  // If the line before the match is mostly empty, it's likely a suffix
  if (currentLine.trim().length < 10) {
    return 'suffix';
  }

  // Otherwise, it's inline
  return 'inline';
}
