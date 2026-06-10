/**
 * Backfill id-list parsing (PR #117 review fix).
 *
 * The old inline filter silently dropped every non-matching line, so a list
 * exported in the prod-canonical 'nl:BWBR...' form produced a successful
 * 0-id no-op — the operator believed the 1,170-document backfill had run.
 * Invalid lines and empty lists now fail loud.
 */

const ID_RE = /^BWB[RV]\d+$/;

export function parseIdList(text: string): string[] {
  const ids: string[] = [];
  const invalid: string[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (ID_RE.test(line)) {
      ids.push(line);
    } else {
      invalid.push(line);
    }
  }

  if (invalid.length > 0) {
    throw new Error(
      `id list contains ${invalid.length} line(s) that are not BWB ids (expected BWBR/BWBV + digits): ` +
        invalid.slice(0, 5).join(', ') +
        (invalid.length > 5 ? ', …' : ''),
    );
  }
  if (ids.length === 0) {
    throw new Error('id list yields zero ids — an empty backfill must never look like success');
  }
  return ids;
}
