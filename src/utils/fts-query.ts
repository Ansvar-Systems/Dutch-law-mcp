/**
 * FTS5 query builder — safe construction of full-text search queries.
 *
 * All user input is sanitized through Unicode token extraction before being
 * used in FTS5 MATCH expressions. No raw user input ever reaches FTS5 directly.
 */

function sanitizeToken(token: string): string {
  // Preserve trailing * for FTS5 prefix queries
  const hasSuffix = token.endsWith('*');
  const cleaned = token.replace(/[^\p{L}\p{N}_]/gu, '');
  return hasSuffix ? `${cleaned}*` : cleaned;
}

function extractTokens(query: string): string[] {
  // Capture word chars plus optional trailing * for prefix search
  const matches = query.normalize('NFC').match(/[\p{L}\p{N}_]+\*?/gu) ?? [];
  return matches.map(sanitizeToken).filter((token) => token.replace(/\*$/, '').length > 1);
}

function ensurePrefix(token: string): string {
  return token.endsWith('*') ? token : `${token}*`;
}

function buildPrefixAndQuery(tokens: string[]): string {
  return tokens.map(ensurePrefix).join(' ');
}

function buildPrefixOrQuery(tokens: string[]): string {
  return tokens.map(ensurePrefix).join(' OR ');
}

export interface FtsQueryVariants {
  primary: string;
  fallback?: string;
}

/**
 * Build FTS5 query variants from user input.
 *
 * Always extracts Unicode word tokens and builds safe prefix queries.
 * Multi-token queries get an AND primary + OR fallback for progressive
 * relaxation. Single-token queries use prefix match only.
 *
 * FTS5 special syntax (", *, AND, OR, NOT, etc.) in user input is never
 * passed through — all input is decomposed into individual word tokens.
 */
export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim();
  if (!trimmed) return { primary: '' };

  const tokens = extractTokens(trimmed);
  if (tokens.length === 0) return { primary: '' };

  const primary = buildPrefixAndQuery(tokens);
  if (tokens.length === 1) return { primary };

  return { primary, fallback: buildPrefixOrQuery(tokens) };
}
