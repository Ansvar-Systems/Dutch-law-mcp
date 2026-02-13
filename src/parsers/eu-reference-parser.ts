export interface ExtractedEUReference {
  type: 'directive' | 'regulation';
  year: number;
  number: number;
  community?: string;
  article?: string;
  reference_type: 'implements' | 'supplements' | 'applies' | 'references';
  raw_match: string;
}

/**
 * Dutch patterns for EU legal references:
 *
 * - Richtlijn (EU) 2019/770          -> directive
 * - Verordening (EU) 2016/679        -> regulation
 * - Richtlijn 95/46/EG               -> directive (old EG-style)
 * - artikel 6.1.c van Verordening    -> with article reference
 */

// Pattern for modern-style references: "Richtlijn (EU) 2019/770" or "Verordening (EU) 2016/679"
const MODERN_PATTERN = /(?:artikel\s+([\w.]+)\s+van\s+)?(?:(Richtlijn|Verordening)\s+\((\w+)\)\s+(\d{4})\/(\d+))/gi;

// Pattern for old-style references: "Richtlijn 95/46/EG" or "Verordening 2016/679/EU"
const OLD_STYLE_PATTERN = /(?:artikel\s+([\w.]+)\s+van\s+)?(?:(Richtlijn|Verordening)\s+(\d{2,4})\/(\d+)\/(\w+))/gi;

// Classification keywords (searched in preceding context)
const IMPLEMENTS_KEYWORDS = ['ter uitvoering van'];
const SUPPLEMENTS_KEYWORDS = ['ter aanvulling van'];
const APPLIES_KEYWORDS = ['op grond van'];

function classifyReferenceType(
  precedingText: string,
): 'implements' | 'supplements' | 'applies' | 'references' {
  const lower = precedingText.toLowerCase();

  for (const kw of IMPLEMENTS_KEYWORDS) {
    if (lower.includes(kw)) return 'implements';
  }
  for (const kw of SUPPLEMENTS_KEYWORDS) {
    if (lower.includes(kw)) return 'supplements';
  }
  for (const kw of APPLIES_KEYWORDS) {
    if (lower.includes(kw)) return 'applies';
  }
  return 'references';
}

function normalizeYear(yearStr: string): number {
  const year = parseInt(yearStr, 10);
  if (year < 100) {
    // Two-digit year: assume 1900s for years >= 50, 2000s otherwise
    return year >= 50 ? 1900 + year : 2000 + year;
  }
  return year;
}

function typeFromDutch(word: string): 'directive' | 'regulation' {
  return word.toLowerCase() === 'richtlijn' ? 'directive' : 'regulation';
}

/**
 * Extract EU references from Dutch statute text.
 */
export function extractEUReferences(text: string): ExtractedEUReference[] {
  const results: ExtractedEUReference[] = [];
  const seen = new Set<string>();

  // Modern-style: "Richtlijn (EU) 2019/770" or "Verordening (EU) 2016/679"
  let match: RegExpExecArray | null;
  MODERN_PATTERN.lastIndex = 0;
  while ((match = MODERN_PATTERN.exec(text)) !== null) {
    const article = match[1] || undefined;
    const docType = typeFromDutch(match[2]);
    const community = match[3];
    const year = normalizeYear(match[4]);
    const number = parseInt(match[5], 10);

    // Get preceding context for classification
    const precedingStart = Math.max(0, match.index - 50);
    const precedingText = text.slice(precedingStart, match.index);
    const reference_type = classifyReferenceType(precedingText);

    const key = `${docType}:${year}/${number}:${article ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        type: docType,
        year,
        number,
        community,
        article,
        reference_type,
        raw_match: match[0],
      });
    }
  }

  // Old-style: "Richtlijn 95/46/EG"
  OLD_STYLE_PATTERN.lastIndex = 0;
  while ((match = OLD_STYLE_PATTERN.exec(text)) !== null) {
    const article = match[1] || undefined;
    const docType = typeFromDutch(match[2]);
    const year = normalizeYear(match[3]);
    const number = parseInt(match[4], 10);
    const community = match[5];

    // Get preceding context for classification
    const precedingStart = Math.max(0, match.index - 50);
    const precedingText = text.slice(precedingStart, match.index);
    const reference_type = classifyReferenceType(precedingText);

    const key = `${docType}:${year}/${number}:${article ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        type: docType,
        year,
        number,
        community,
        article,
        reference_type,
        raw_match: match[0],
      });
    }
  }

  return results;
}
