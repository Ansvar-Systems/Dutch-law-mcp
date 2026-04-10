import { describe, it, expect } from 'vitest';
import {
  buildFtsQueryVariants,
  DUTCH_LEGAL_STOPWORDS,
  filterStopwords,
} from '../../src/utils/fts-query.js';

describe('Dutch legal stopword filtering', () => {
  describe('DUTCH_LEGAL_STOPWORDS', () => {
    it('should contain common Dutch determiners', () => {
      expect(DUTCH_LEGAL_STOPWORDS.has('de')).toBe(true);
      expect(DUTCH_LEGAL_STOPWORDS.has('het')).toBe(true);
      expect(DUTCH_LEGAL_STOPWORDS.has('een')).toBe(true);
    });

    it('should contain ubiquitous legal terms', () => {
      expect(DUTCH_LEGAL_STOPWORDS.has('wet')).toBe(true);
      expect(DUTCH_LEGAL_STOPWORDS.has('art')).toBe(true);
      expect(DUTCH_LEGAL_STOPWORDS.has('lid')).toBe(true);
    });

    it('should NOT contain substantive legal terms', () => {
      expect(DUTCH_LEGAL_STOPWORDS.has('onrechtmatige')).toBe(false);
      expect(DUTCH_LEGAL_STOPWORDS.has('persoonsgegevens')).toBe(false);
      expect(DUTCH_LEGAL_STOPWORDS.has('telecommunicatiewet')).toBe(false);
    });
  });

  describe('filterStopwords', () => {
    it('should remove stopwords from token list', () => {
      const result = filterStopwords(['de', 'bescherming', 'van', 'persoonsgegevens']);
      expect(result).toEqual(['bescherming', 'persoonsgegevens']);
    });

    it('should be case-insensitive', () => {
      const result = filterStopwords(['De', 'Wet', 'bescherming']);
      expect(result).toEqual(['bescherming']);
    });

    it('should handle trailing FTS5 wildcards', () => {
      const result = filterStopwords(['wet*', 'privacy*']);
      expect(result).toEqual(['privacy*']);
    });

    it('should return empty array when all tokens are stopwords', () => {
      const result = filterStopwords(['de', 'het', 'een', 'van']);
      expect(result).toEqual([]);
    });

    it('should pass through non-stopword tokens unchanged', () => {
      const result = filterStopwords(['arbeidsovereenkomst', 'onrechtmatige', 'daad']);
      expect(result).toEqual(['arbeidsovereenkomst', 'onrechtmatige', 'daad']);
    });
  });

  describe('buildFtsQueryVariants with stopwords', () => {
    it('should filter stopwords from multi-token queries', () => {
      const result = buildFtsQueryVariants('de bescherming van persoonsgegevens');
      // 'de' and 'van' are stopwords, should be filtered
      expect(result.primary).toContain('bescherming');
      expect(result.primary).toContain('persoonsgegevens');
      expect(result.primary).not.toContain(' de*');
      expect(result.primary).not.toContain(' van*');
    });

    it('should return tooBroad when all tokens are stopwords', () => {
      const result = buildFtsQueryVariants('de het een van');
      expect(result.primary).toBe('');
      expect(result.tooBroad).toBe(true);
    });

    it('should return tooBroad for single stopword "wet"', () => {
      const result = buildFtsQueryVariants('wet');
      expect(result.primary).toBe('');
      expect(result.tooBroad).toBe(true);
    });

    it('should return tooBroad for "art lid nr"', () => {
      const result = buildFtsQueryVariants('art lid nr');
      expect(result.primary).toBe('');
      expect(result.tooBroad).toBe(true);
    });

    it('should NOT flag tooBroad when substantive tokens remain', () => {
      const result = buildFtsQueryVariants('wet bescherming persoonsgegevens');
      expect(result.tooBroad).toBeUndefined();
      expect(result.primary).toContain('bescherming');
      expect(result.primary).toContain('persoonsgegevens');
    });

    it('should preserve existing behavior for clean queries', () => {
      const result = buildFtsQueryVariants('onrechtmatige daad');
      expect(result.primary).toBe('onrechtmatige* daad*');
      expect(result.fallback).toBe('onrechtmatige* OR daad*');
      expect(result.tooBroad).toBeUndefined();
    });

    it('should preserve existing behavior for single substantive token', () => {
      const result = buildFtsQueryVariants('arbeidsovereenkomst');
      expect(result.primary).toBe('arbeidsovereenkomst*');
      expect(result.fallback).toBeUndefined();
      expect(result.tooBroad).toBeUndefined();
    });

    it('should not flag tooBroad for empty or whitespace input', () => {
      const empty = buildFtsQueryVariants('');
      expect(empty.primary).toBe('');
      expect(empty.tooBroad).toBeUndefined();

      const whitespace = buildFtsQueryVariants('   ');
      expect(whitespace.primary).toBe('');
      expect(whitespace.tooBroad).toBeUndefined();
    });

    it('should handle mixed stopwords and substantive tokens', () => {
      // "de wet op de privacy" → only "privacy" survives
      const result = buildFtsQueryVariants('de wet op de privacy');
      expect(result.primary).toBe('privacy*');
      expect(result.tooBroad).toBeUndefined();
    });
  });
});
