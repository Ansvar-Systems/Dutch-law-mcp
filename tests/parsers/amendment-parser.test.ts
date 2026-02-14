import { describe, it, expect } from 'vitest';
import {
  extractAmendmentReferences,
  parseStatuteAmendments,
  isValidStaatsbladRef,
  normalizeStaatsbladRef,
  extractEffectiveDate
} from '../../src/parsers/amendment-parser.js';

describe('amendment-parser', () => {
  describe('extractAmendmentReferences', () => {
    it('extracts Stb. YYYY, NNN references', () => {
      const text = 'Dit artikel is gewijzigd bij wet van 1 januari 2020, Stb. 2020, 123';
      const refs = extractAmendmentReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].staatsblad_ref).toBe('2020, 123');
      expect(refs[0].amendment_type).toBe('gewijzigd');
    });

    it('detects "Gewijzigd bij" amendments', () => {
      const text = 'Gewijzigd bij wet van 15 maart 2021, Stb. 2021, 456';
      const refs = extractAmendmentReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].amendment_type).toBe('gewijzigd');
      expect(refs[0].staatsblad_ref).toBe('2021, 456');
      expect(refs[0].raw_text).toContain('Gewijzigd bij');
    });

    it('detects "Vervallen per" expirations', () => {
      const text = 'Vervallen per 1 januari 2022';
      const refs = extractAmendmentReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].amendment_type).toBe('vervallen');
      expect(refs[0].raw_text).toContain('Vervallen per');
    });

    it('detects "Ingetrokken bij" withdrawals', () => {
      const text = 'Ingetrokken bij wet van 10 mei 2019, Stb. 2019, 789';
      const refs = extractAmendmentReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].amendment_type).toBe('ingetrokken');
      expect(refs[0].staatsblad_ref).toBe('2019, 789');
    });

    it('detects "Ingevoegd bij" insertions', () => {
      const text = 'Ingevoegd bij wet van 20 juni 2018, Stb. 2018, 111';
      const refs = extractAmendmentReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].amendment_type).toBe('ingevoegd');
      expect(refs[0].staatsblad_ref).toBe('2018, 111');
    });

    it('extracts BWB-ID references', () => {
      const text = 'Gewijzigd bij BWBR0011823 met ingang van 1 januari 2023';
      const refs = extractAmendmentReferences(text);

      expect(refs.length).toBeGreaterThan(0);
      const bwbRef = refs.find(r => r.amended_by_bwb);
      expect(bwbRef).toBeDefined();
      expect(bwbRef?.amended_by_bwb).toBe('BWBR0011823');
    });

    it('returns empty array for text without amendments', () => {
      const text = 'Dit is gewone wettekst zonder wijzigingen.';
      const refs = extractAmendmentReferences(text);

      expect(refs).toHaveLength(0);
    });

    it('handles multiple amendments in one text', () => {
      const text = `
        Gewijzigd bij wet van 1 januari 2020, Stb. 2020, 100.
        Laatstelijk gewijzigd bij Stb. 2021, 200.
        Ingevoegd bij wet van 15 maart 2019, Stb. 2019, 50.
      `;
      const refs = extractAmendmentReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(3);
    });

    it('handles "Laatstelijk gewijzigd bij" format', () => {
      const text = 'Laatstelijk gewijzigd bij Stb. 2022, 999';
      const refs = extractAmendmentReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].amendment_type).toBe('gewijzigd');
      expect(refs[0].staatsblad_ref).toBe('2022, 999');
    });

    it('deduplicates identical references', () => {
      const text = `
        Gewijzigd bij wet van 1 januari 2020, Stb. 2020, 123.
        Gewijzigd bij wet van 1 januari 2020, Stb. 2020, 123.
      `;
      const refs = extractAmendmentReferences(text);

      expect(refs).toHaveLength(1);
    });
  });

  describe('parseStatuteAmendments', () => {
    it('processes multiple provisions', () => {
      const provisions = [
        {
          provision_ref: '1:1',
          content: 'Gewijzigd bij wet van 1 januari 2020, Stb. 2020, 100'
        },
        {
          provision_ref: '1:2',
          content: 'Vervallen per 1 juni 2021'
        },
        {
          provision_ref: '1:3',
          content: 'Geen wijzigingen'
        }
      ];

      const results = parseStatuteAmendments(provisions);

      expect(results).toHaveLength(3);
      expect(results[0].provision_ref).toBe('1:1');
      expect(results[0].amendments).toHaveLength(1);
      expect(results[1].provision_ref).toBe('1:2');
      expect(results[1].amendments).toHaveLength(1);
      expect(results[2].provision_ref).toBe('1:3');
      expect(results[2].amendments).toHaveLength(0);
    });
  });

  describe('isValidStaatsbladRef', () => {
    it('validates correct Staatsblad references', () => {
      expect(isValidStaatsbladRef('2020, 123')).toBe(true);
      expect(isValidStaatsbladRef('2020,123')).toBe(true);
      expect(isValidStaatsbladRef('2021, 1')).toBe(true);
      expect(isValidStaatsbladRef('1999, 999')).toBe(true);
    });

    it('rejects invalid Staatsblad references', () => {
      expect(isValidStaatsbladRef('2020')).toBe(false);
      expect(isValidStaatsbladRef('abc, 123')).toBe(false);
      expect(isValidStaatsbladRef('2020, abc')).toBe(false);
      expect(isValidStaatsbladRef('')).toBe(false);
    });
  });

  describe('normalizeStaatsbladRef', () => {
    it('normalizes Staatsblad references to standard format', () => {
      expect(normalizeStaatsbladRef('2020,123')).toBe('2020, 123');
      expect(normalizeStaatsbladRef('2020, 123')).toBe('2020, 123');
      expect(normalizeStaatsbladRef('2021,  456')).toBe('2021, 456');
    });

    it('returns null for invalid references', () => {
      expect(normalizeStaatsbladRef('invalid')).toBe(null);
      expect(normalizeStaatsbladRef('2020')).toBe(null);
      expect(normalizeStaatsbladRef('')).toBe(null);
    });
  });

  describe('extractEffectiveDate', () => {
    it('extracts Dutch dates correctly', () => {
      expect(extractEffectiveDate('1 januari 2020')).toBe('2020-01-01');
      expect(extractEffectiveDate('15 maart 2021')).toBe('2021-03-15');
      expect(extractEffectiveDate('31 december 2022')).toBe('2022-12-31');
    });

    it('handles single-digit days', () => {
      expect(extractEffectiveDate('5 mei 2020')).toBe('2020-05-05');
      expect(extractEffectiveDate('9 september 2021')).toBe('2021-09-09');
    });

    it('handles all Dutch months', () => {
      expect(extractEffectiveDate('1 februari 2020')).toBe('2020-02-01');
      expect(extractEffectiveDate('1 april 2020')).toBe('2020-04-01');
      expect(extractEffectiveDate('1 juni 2020')).toBe('2020-06-01');
      expect(extractEffectiveDate('1 juli 2020')).toBe('2020-07-01');
      expect(extractEffectiveDate('1 augustus 2020')).toBe('2020-08-01');
      expect(extractEffectiveDate('1 oktober 2020')).toBe('2020-10-01');
      expect(extractEffectiveDate('1 november 2020')).toBe('2020-11-01');
    });

    it('returns null for invalid dates', () => {
      expect(extractEffectiveDate('invalid date')).toBe(null);
      expect(extractEffectiveDate('2020-01-01')).toBe(null);
      expect(extractEffectiveDate('')).toBe(null);
    });

    it('extracts dates from longer text', () => {
      const text = 'Vervallen per 1 januari 2020 volgens wet';
      expect(extractEffectiveDate(text)).toBe('2020-01-01');
    });

    it('handles case-insensitive month names', () => {
      expect(extractEffectiveDate('1 Januari 2020')).toBe('2020-01-01');
      expect(extractEffectiveDate('1 MAART 2020')).toBe('2020-03-01');
    });
  });
});
