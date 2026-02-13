import type { CitationFormat } from '../types/citations.js';
import { parseCitation } from './parser.js';

const CODE_FULL_NAMES: Record<string, string> = {
  'BW': 'Burgerlijk Wetboek',
  'Sr': 'Wetboek van Strafrecht',
  'Sv': 'Wetboek van Strafvordering',
  'Awb': 'Algemene wet bestuursrecht',
  'Gw': 'Grondwet',
  'Fw': 'Faillissementswet',
  'WvK': 'Wetboek van Koophandel',
  'Rv': 'Wetboek van Burgerlijke Rechtsvordering',
  'Wft': 'Wet op het financieel toezicht',
  'Wm': 'Wet milieubeheer',
  'WOR': 'Wet op de ondernemingsraden',
  'WVW': 'Wegenverkeerswet 1994',
};

export function formatCitation(citation: string, format: CitationFormat = 'full'): string {
  const parsed = parseCitation(citation);
  if (!parsed.valid) return citation;

  if (parsed.type === 'case_law' && parsed.ecli) {
    return parsed.ecli;
  }

  if (parsed.type === 'kamerstuk') {
    return parsed.raw;  // Kamerstukken are already in standard format
  }

  if (parsed.type === 'eu_directive' || parsed.type === 'eu_regulation') {
    return parsed.raw;  // EU citations are already in standard format
  }

  // Statute formatting
  if (parsed.type === 'statute' && parsed.code_abbreviation) {
    const code = parsed.code_abbreviation;
    const artRef = parsed.book ? `${parsed.book}:${parsed.article}` : parsed.article;
    const lidStr = parsed.lid ? ` lid ${parsed.lid}` : '';

    switch (format) {
      case 'full': {
        const fullName = CODE_FULL_NAMES[code] || code;
        const bookSuffix = parsed.book ? ` Boek ${parsed.book}` : '';
        return `Art. ${artRef}${lidStr} ${fullName}${bookSuffix}`;
      }
      case 'short':
        return `Art. ${artRef}${lidStr} ${code}`;
      case 'pinpoint':
        return `Art. ${artRef}${lidStr}`;
    }
  }

  return citation;
}
