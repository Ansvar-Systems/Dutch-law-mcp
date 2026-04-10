/**
 * FTS5 query builder — safe construction of full-text search queries.
 *
 * All user input is sanitized through Unicode token extraction before being
 * used in FTS5 MATCH expressions. No raw user input ever reaches FTS5 directly.
 *
 * Dutch legal stopwords are filtered to prevent pathologically broad queries
 * (e.g. {"query": "wet"} which matches every row in the corpus). When all
 * tokens are stopwords the query is rejected with `tooBroad: true`.
 */

// Common Dutch words and short legal abbreviations that match nearly every
// document when used as FTS5 prefix queries. Kept deliberately small —
// only words that produce corpus-wide scans. Lowercase, no wildcards.
const DUTCH_LEGAL_STOPWORDS = new Set([
  // determiners / prepositions / conjunctions
  'de',
  'het',
  'een',
  'van',
  'en',
  'in',
  'op',
  'te',
  'met',
  'voor',
  'dat',
  'die',
  'der',
  'des',
  'den',
  'aan',
  'uit',
  'tot',
  'bij',
  'om',
  'als',
  'ook',
  'nog',
  'wel',
  'niet',
  'naar',
  'over',
  'door',
  'maar',
  'dit',
  'zijn',
  'worden',
  'kan',
  'moet',
  'zal',
  'deze',
  'heeft',
  // ubiquitous legal terms that match the entire corpus
  'wet',
  'art',
  'lid',
  'nr',
  // parliamentary-corpus specific — matches every Tweede Kamer proceeding
  'kamer',
]);

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

/**
 * Remove Dutch legal stopwords from a token list.
 * Comparison is case-insensitive and ignores trailing FTS5 wildcards.
 */
function filterStopwords(tokens: string[]): string[] {
  return tokens.filter((t) => !DUTCH_LEGAL_STOPWORDS.has(t.replace(/\*$/, '').toLowerCase()));
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
  /**
   * True when every extracted token was a stopword. Callers should return
   * an informative error instead of running the query.
   */
  tooBroad?: boolean;
}

/**
 * Build FTS5 query variants from user input.
 *
 * Always extracts Unicode word tokens, filters Dutch legal stopwords,
 * and builds safe prefix queries.
 * Multi-token queries get an AND primary + OR fallback for progressive
 * relaxation. Single-token queries use prefix match only.
 *
 * FTS5 special syntax (", *, AND, OR, NOT, etc.) in user input is never
 * passed through — all input is decomposed into individual word tokens.
 *
 * If all tokens are stopwords, returns `{ primary: '', tooBroad: true }`.
 */
export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim();
  if (!trimmed) return { primary: '' };

  const rawTokens = extractTokens(trimmed);
  if (rawTokens.length === 0) return { primary: '' };

  const tokens = filterStopwords(rawTokens);

  // Every token was a stopword — reject the query
  if (tokens.length === 0) {
    return { primary: '', tooBroad: true };
  }

  const primary = buildPrefixAndQuery(tokens);
  if (tokens.length === 1) return { primary };

  return { primary, fallback: buildPrefixOrQuery(tokens) };
}

/** Exported for testing only. */
export { DUTCH_LEGAL_STOPWORDS, filterStopwords };
