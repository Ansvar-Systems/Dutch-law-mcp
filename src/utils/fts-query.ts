const EXPLICIT_FTS_SYNTAX_PATTERN = /["*():^]|\bAND\b|\bOR\b|\bNOT\b/iu;

function sanitizeToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}_]/gu, '');
}

function extractTokens(query: string): string[] {
  const matches = query.normalize('NFC').match(/[\p{L}\p{N}_]+/gu) ?? [];
  return matches.map(sanitizeToken).filter(token => token.length > 1);
}

function escapeExplicitQuery(query: string): string {
  return query.replace(/[()^:]/g, (char) => `"${char}"`);
}

function buildPrefixAndQuery(tokens: string[]): string {
  return tokens.map(token => `${token}*`).join(' ');
}

function buildPrefixOrQuery(tokens: string[]): string {
  return tokens.map(token => `${token}*`).join(' OR ');
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
