import { describe, it, expect } from 'vitest';
import { parseIdList } from '../src/ingest/id-list.js';

// Backfill id-list validation (PR #117 review fix). The old filter silently
// dropped every non-matching line, so a list exported in the prod-canonical
// 'nl:BWBR...' form produced a successful 0-id no-op — and the operator
// believed the 1,170-document backfill had run.

describe('parseIdList', () => {
  it('parses BWB ids, skipping blank lines and # comments', () => {
    expect(parseIdList('BWBR0001854\n\n# AMvB block\nBWBV0001506\n')).toEqual([
      'BWBR0001854',
      'BWBV0001506',
    ]);
  });

  it('throws on non-empty lines that are not BWB ids, naming them', () => {
    expect(() => parseIdList('nl:BWBR0001854\nBWBR0001855')).toThrow(/nl:BWBR0001854/);
  });

  it('throws when the list yields zero ids — an empty backfill must never look like success', () => {
    expect(() => parseIdList('\n# only comments\n')).toThrow(/zero/i);
  });
});

describe('parseIdList — BWBW ids (delta review)', () => {
  it('accepts any BWB+letter prefix (BWBW laws exist in the live corpus)', () => {
    expect(parseIdList('BWBW5113\nBWBW7972')).toEqual(['BWBW5113', 'BWBW7972']);
  });
});
