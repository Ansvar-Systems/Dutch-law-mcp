import type { ParsedCitation } from '../types/citations.js';

// Map code abbreviations to BWB-IDs
const CODE_TO_BWB: Record<string, string> = {
  'BW': 'BWBR0005289',
  'Sr': 'BWBR0001854',
  'Sv': 'BWBR0001903',
  'Awb': 'BWBR0005537',
  'Gw': 'BWBR0001840',
  'Fw': 'BWBR0001860',
  'WvK': 'BWBR0001838',
  'Rv': 'BWBR0001827',
  'Wft': 'BWBR0020368',
  'Wm': 'BWBR0003245',
  'WOR': 'BWBR0002747',
  'WVW': 'BWBR0006622',
};

const ECLI_PATTERN = /^ECLI:NL:[A-Z]{2,5}:\d{4}:\d+$/;
const KAMERSTUKKEN_PATTERN = /^Kamerstukken\s+(I{1,2})\s+(\d{4}\/\d{2}),\s+(\d+(?:-\d+)?),\s+nr\.\s+(\S+)/;
const EU_DIRECTIVE_PATTERN = /^[Rr]ichtlijn\s+(?:\(?(EU|EG|EEG)\)?\s+)?(?:nr\.\s*)?(\d{2,4})\/(\d+)(?:\/(EU|EG|EEG))?/;
const EU_REGULATION_PATTERN = /^[Vv]erordening\s+(?:\(?(EU|EG|EEG)\)?\s+)?(?:nr\.\s*)?(\d{2,4})\/(\d+)/;

// Statute pattern: Art. 6:162 lid 2 BW  OR  art. 287 Sr  OR  artikel 1 Gw
// The code abbreviation list as regex alternation
const CODE_NAMES = Object.keys(CODE_TO_BWB).join('|');
const STATUTE_PATTERN = new RegExp(
  `^[Aa]rt(?:ikel)?\\.?\\s+(\\d+)(?::(\\d+\\w*))?(?:\\s+lid\\s+(\\d+))?\\s+(${CODE_NAMES})$`
);

export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();
  if (!trimmed) {
    return { raw: citation, type: 'statute', document_id: '', valid: false, error: 'Empty citation' };
  }

  // 1. Try ECLI
  if (ECLI_PATTERN.test(trimmed)) {
    return {
      raw: citation,
      type: 'case_law',
      document_id: trimmed,
      ecli: trimmed,
      valid: true,
    };
  }

  // 2. Try Kamerstukken
  const kamMatch = trimmed.match(KAMERSTUKKEN_PATTERN);
  if (kamMatch) {
    return {
      raw: citation,
      type: 'kamerstuk',
      document_id: `KST-${kamMatch[3]}-${kamMatch[4]}`,
      chamber: kamMatch[1],
      valid: true,
    };
  }

  // 3. Try EU directive
  const dirMatch = trimmed.match(EU_DIRECTIVE_PATTERN);
  if (dirMatch) {
    const year = parseInt(dirMatch[2], 10);
    const number = parseInt(dirMatch[3], 10);
    return {
      raw: citation,
      type: 'eu_directive',
      document_id: `directive:${year}/${number}`,
      valid: true,
    };
  }

  // 4. Try EU regulation
  const regMatch = trimmed.match(EU_REGULATION_PATTERN);
  if (regMatch) {
    const year = parseInt(regMatch[2], 10);
    const number = parseInt(regMatch[3], 10);
    return {
      raw: citation,
      type: 'eu_regulation',
      document_id: `regulation:${year}/${number}`,
      valid: true,
    };
  }

  // 5. Try Statute
  const statMatch = trimmed.match(STATUTE_PATTERN);
  if (statMatch) {
    const firstNum = statMatch[1];
    const secondNum = statMatch[2];
    const lid = statMatch[3];
    const code = statMatch[4];
    const bwbId = CODE_TO_BWB[code] || code;

    let book: string | undefined;
    let article: string;

    if (secondNum) {
      // Pattern like 6:162 — first is book/chapter, second is article
      book = firstNum;
      article = secondNum;
    } else {
      // Pattern like 287 — just article number
      article = firstNum;
    }

    return {
      raw: citation,
      type: 'statute',
      document_id: bwbId,
      book,
      article,
      lid,
      code_abbreviation: code,
      valid: true,
    };
  }

  return { raw: citation, type: 'statute', document_id: '', valid: false, error: `Unrecognized citation format: "${trimmed}"` };
}
