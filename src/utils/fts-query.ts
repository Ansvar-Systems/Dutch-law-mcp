const EXPLICIT_FTS_SYNTAX_PATTERN = /["():^]|\bAND\b|\bOR\b|\bNOT\b/iu;

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

function escapeExplicitQuery(query: string): string {
  return query.replace(/[()^:]/g, (char) => `"${char}"`);
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

export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim();
  if (!trimmed) return { primary: '' };

  if (EXPLICIT_FTS_SYNTAX_PATTERN.test(trimmed)) {
    return { primary: escapeExplicitQuery(trimmed) };
  }

  const tokens = extractTokens(trimmed);
  if (tokens.length === 0) return { primary: escapeExplicitQuery(trimmed) };

  const primary = buildPrefixAndQuery(tokens);
  if (tokens.length === 1) return { primary };

  return { primary, fallback: buildPrefixOrQuery(tokens) };
}
