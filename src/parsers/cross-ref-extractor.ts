/**
 * Cross-reference extractor for Dutch legal text
 *
 * Extracts references to other legal provisions from Dutch legal text, including:
 * - Article references (e.g. "artikel 6:162 BW")
 * - BWB-ID references
 * - Structural references (e.g. "Boek 6, titel 3")
 */

export interface ExtractedRef {
  /** BWB-ID if detected */
  target_bwb_id?: string;
  /** Target provision reference (e.g. "6:162") */
  target_provision_ref?: string;
  /** Short name of referenced statute (e.g. "BW", "Sr", "Awb") */
  target_short_name?: string;
  /** Raw text of the reference */
  raw_text: string;
}

/**
 * Common Dutch statute short names
 */
const STATUTE_SHORT_NAMES = [
  'BW',   // Burgerlijk Wetboek
  'Sr',   // Wetboek van Strafrecht
  'Sv',   // Wetboek van Strafvordering
  'Awb',  // Algemene wet bestuursrecht
  'Gw',   // Grondwet
  'Wvw',  // Wegenverkeerswet
  'WvK',  // Wetboek van Koophandel
  'Fw',   // Faillissementswet
  'Rv',   // Wetboek van Burgerlijke Rechtsvordering
];

/**
 * Mapping of short names to BWB-IDs (for common statutes)
 */
const SHORT_NAME_TO_BWB: Record<string, string> = {
  'BW': 'BWBR0005289',      // Burgerlijk Wetboek
  'Sr': 'BWBR0001854',      // Wetboek van Strafrecht
  'Sv': 'BWBR0001903',      // Wetboek van Strafvordering
  'Awb': 'BWBR0005537',     // Algemene wet bestuursrecht
  'Gw': 'BWBR0001840',      // Grondwet
  'Rv': 'BWBR0001827',      // Wetboek van Burgerlijke Rechtsvordering
};

/**
 * Extract all cross-references from legal text
 */
export function extractCrossReferences(text: string): ExtractedRef[] {
  const references: ExtractedRef[] = [];
  const seenRefs = new Set<string>();

  // Pattern for "artikel 6:162 BW" or "art. 6:162 BW"
  const articleWithShortNamePattern = new RegExp(
    `(?:artikel|art\\.?)\\s+(\\d+(?:[:.]\\d+)?(?:[a-z])?(?:\\s+(?:lid|onder)\\s+\\d+)?)\\s+(${STATUTE_SHORT_NAMES.join('|')})(?![a-zA-Z])`,
    'gi'
  );

  // Extract article references with short names (most specific)
  const matches1 = text.matchAll(articleWithShortNamePattern);
  for (const match of matches1) {
    const provision_ref = normalizeProvisionRef(match[1]);
    const short_name = STATUTE_SHORT_NAMES.find(s => s.toLowerCase() === match[2].toLowerCase()) ?? match[2];
    const key = `${short_name}-${provision_ref}`;

    if (!seenRefs.has(key)) {
      seenRefs.add(key);

      const ref: ExtractedRef = {
        target_provision_ref: provision_ref,
        target_short_name: short_name,
        raw_text: match[0]
      };

      // Add BWB-ID if we know it
      if (SHORT_NAME_TO_BWB[short_name]) {
        ref.target_bwb_id = SHORT_NAME_TO_BWB[short_name];
      }

      references.push(ref);
    }
  }

  // Pattern for "artikel 6:162" or "artikel 47" without short name
  const articlePlainPattern = /(?:artikel|art\.?)\s+(\d+(?:[:.]\d+)?(?:[a-z])?(?:\s+(?:lid|onder)\s+\d+)?)/gi;

  // Extract plain article references (without short name)
  const matches2 = text.matchAll(articlePlainPattern);
  for (const match of matches2) {
    const provision_ref = normalizeProvisionRef(match[1]);
    const key = `plain-${provision_ref}`;

    // Only add if we haven't seen this provision with a short name
    const alreadyFound = references.some(r => r.target_provision_ref === provision_ref);

    if (!seenRefs.has(key) && !alreadyFound) {
      seenRefs.add(key);
      references.push({
        target_provision_ref: provision_ref,
        raw_text: match[0]
      });
    }
  }

  // Pattern for BWB-ID reference
  const bwbIdPattern = /BWBR\d{7}/gi;

  // Extract BWB-ID references
  const matches3 = text.matchAll(bwbIdPattern);
  for (const match of matches3) {
    const bwb_id = match[0];
    const key = `bwb-${bwb_id}`;

    // Only add if we haven't seen this BWB-ID already
    const alreadyFound = references.some(r => r.target_bwb_id === bwb_id);

    if (!seenRefs.has(key) && !alreadyFound) {
      seenRefs.add(key);
      references.push({
        target_bwb_id: bwb_id,
        raw_text: match[0]
      });
    }
  }

  return references;
}

/**
 * Normalize provision reference to consistent format
 * Converts "6.162" to "6:162", removes extra spaces, etc.
 */
function normalizeProvisionRef(ref: string): string {
  // Replace dot with colon for book:article format
  let normalized = ref.replace(/\./, ':');

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
