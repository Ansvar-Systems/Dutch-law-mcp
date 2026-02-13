import { describe, it, expect } from 'vitest';
import { parseCitation } from '../../src/citation/parser.js';

describe('parseCitation', () => {
  describe('statute citations', () => {
    it('should parse "Art. 6:162 BW"', () => {
      const r = parseCitation('Art. 6:162 BW');
      expect(r.valid).toBe(true);
      expect(r.type).toBe('statute');
      expect(r.code_abbreviation).toBe('BW');
      expect(r.book).toBe('6');
      expect(r.article).toBe('162');
      expect(r.document_id).toBe('BWBR0005289');
    });

    it('should parse "art. 287 Sr"', () => {
      const r = parseCitation('art. 287 Sr');
      expect(r.valid).toBe(true);
      expect(r.type).toBe('statute');
      expect(r.code_abbreviation).toBe('Sr');
      expect(r.article).toBe('287');
      expect(r.book).toBeUndefined();
      expect(r.document_id).toBe('BWBR0001854');
    });

    it('should parse "Art. 6:162 lid 2 BW"', () => {
      const r = parseCitation('Art. 6:162 lid 2 BW');
      expect(r.valid).toBe(true);
      expect(r.lid).toBe('2');
      expect(r.book).toBe('6');
      expect(r.article).toBe('162');
    });

    it('should parse "artikel 1 Gw"', () => {
      const r = parseCitation('artikel 1 Gw');
      expect(r.valid).toBe(true);
      expect(r.code_abbreviation).toBe('Gw');
      expect(r.article).toBe('1');
    });

    it('should parse "art. 8:1 Awb"', () => {
      const r = parseCitation('art. 8:1 Awb');
      expect(r.valid).toBe(true);
      expect(r.code_abbreviation).toBe('Awb');
      expect(r.book).toBe('8');
      expect(r.article).toBe('1');
    });
  });

  describe('ECLI citations', () => {
    it('should parse "ECLI:NL:HR:2019:376"', () => {
      const r = parseCitation('ECLI:NL:HR:2019:376');
      expect(r.valid).toBe(true);
      expect(r.type).toBe('case_law');
      expect(r.ecli).toBe('ECLI:NL:HR:2019:376');
    });

    it('should parse "ECLI:NL:RBAMS:2023:1234"', () => {
      const r = parseCitation('ECLI:NL:RBAMS:2023:1234');
      expect(r.valid).toBe(true);
      expect(r.type).toBe('case_law');
    });
  });

  describe('kamerstukken citations', () => {
    it('should parse "Kamerstukken II 2020/21, 35815, nr. 2"', () => {
      const r = parseCitation('Kamerstukken II 2020/21, 35815, nr. 2');
      expect(r.valid).toBe(true);
      expect(r.type).toBe('kamerstuk');
      expect(r.chamber).toBe('II');
    });

    it('should parse "Kamerstukken I 2020/21, 35815, nr. AB"', () => {
      const r = parseCitation('Kamerstukken I 2020/21, 35815, nr. AB');
      expect(r.valid).toBe(true);
      expect(r.chamber).toBe('I');
    });
  });

  describe('EU citations', () => {
    it('should parse "Richtlijn (EU) 2019/770"', () => {
      const r = parseCitation('Richtlijn (EU) 2019/770');
      expect(r.valid).toBe(true);
      expect(r.type).toBe('eu_directive');
      expect(r.document_id).toContain('directive');
    });

    it('should parse "Richtlijn 95/46/EG"', () => {
      const r = parseCitation('Richtlijn 95/46/EG');
      expect(r.valid).toBe(true);
      expect(r.type).toBe('eu_directive');
    });

    it('should parse "Verordening (EU) 2016/679"', () => {
      const r = parseCitation('Verordening (EU) 2016/679');
      expect(r.valid).toBe(true);
      expect(r.type).toBe('eu_regulation');
      expect(r.document_id).toContain('regulation');
    });
  });

  describe('invalid citations', () => {
    it('should reject empty string', () => {
      expect(parseCitation('').valid).toBe(false);
    });

    it('should reject unrecognized format', () => {
      expect(parseCitation('some random text').valid).toBe(false);
    });
  });
});
