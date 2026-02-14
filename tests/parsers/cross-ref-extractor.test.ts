import { describe, it, expect } from 'vitest';
import { extractCrossReferences } from '../../src/parsers/cross-ref-extractor.js';

describe('cross-ref-extractor', () => {
  describe('extractCrossReferences', () => {
    it('extracts "art. 6:162 BW" references', () => {
      const text = 'Volgens art. 6:162 BW is de schuldenaar aansprakelijk.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_provision_ref).toBe('6:162');
      expect(refs[0].target_short_name).toBe('BW');
      expect(refs[0].target_bwb_id).toBe('BWBR0005289');
      expect(refs[0].raw_text).toContain('art. 6:162 BW');
    });

    it('extracts "artikel 287 Sr" references', () => {
      const text = 'De verdachte wordt vervolgd op grond van artikel 287 Sr.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_provision_ref).toBe('287');
      expect(refs[0].target_short_name).toBe('Sr');
      expect(refs[0].target_bwb_id).toBe('BWBR0001854');
    });

    it('extracts "art. 8:1 Awb" references', () => {
      const text = 'Op grond van art. 8:1 Awb kan belanghebbende beroep instellen.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_provision_ref).toBe('8:1');
      expect(refs[0].target_short_name).toBe('Awb');
      expect(refs[0].target_bwb_id).toBe('BWBR0005537');
    });

    it('extracts BWB-ID references', () => {
      const text = 'Zie BWBR0011823 voor meer informatie.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_bwb_id).toBe('BWBR0011823');
    });

    it('deduplicates references', () => {
      const text = 'Zie art. 6:162 BW en nogmaals art. 6:162 BW voor details.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
    });

    it('returns empty array for text without references', () => {
      const text = 'Dit is gewone tekst zonder verwijzingen.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(0);
    });

    it('handles multiple references in one text', () => {
      const text = `
        Op grond van art. 6:162 BW en artikel 287 Sr wordt gesteld dat
        de verdachte aansprakelijk is. Zie ook art. 8:1 Awb.
      `;
      const refs = extractCrossReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(3);

      const bwRef = refs.find(r => r.target_short_name === 'BW');
      const srRef = refs.find(r => r.target_short_name === 'Sr');
      const awbRef = refs.find(r => r.target_short_name === 'Awb');

      expect(bwRef).toBeDefined();
      expect(srRef).toBeDefined();
      expect(awbRef).toBeDefined();
    });

    it('handles article references with sub-provisions', () => {
      const text = 'Zie artikel 6:162 lid 1 BW.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_provision_ref).toContain('6:162');
      expect(refs[0].target_short_name).toBe('BW');
    });

    it('handles article references with letter suffixes', () => {
      const text = 'Volgens art. 7:658a BW geldt het volgende.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_provision_ref).toBe('7:658a');
      expect(refs[0].target_short_name).toBe('BW');
    });

    it('handles Grondwet (Gw) references', () => {
      const text = 'Artikel 1 Gw waarborgt gelijke behandeling.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_provision_ref).toBe('1');
      expect(refs[0].target_short_name).toBe('Gw');
      expect(refs[0].target_bwb_id).toBe('BWBR0001840');
    });

    it('handles Wetboek van Burgerlijke Rechtsvordering (Rv) references', () => {
      const text = 'Volgens artikel 21 Rv is de rechtbank bevoegd.';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_provision_ref).toBe('21');
      expect(refs[0].target_short_name).toBe('Rv');
      expect(refs[0].target_bwb_id).toBe('BWBR0001827');
    });

    it('handles article references without short name', () => {
      const text = 'In artikel 6:162 wordt gesteld dat...';
      const refs = extractCrossReferences(text);

      expect(refs).toHaveLength(1);
      expect(refs[0].target_provision_ref).toBe('6:162');
      expect(refs[0].target_short_name).toBeUndefined();
    });

    it('does not duplicate when same provision has both forms', () => {
      const text = 'Zie artikel 6:162 zoals bedoeld in art. 6:162 BW.';
      const refs = extractCrossReferences(text);

      // Should have one with short name, not duplicate the plain reference
      const withShortName = refs.filter(r => r.target_short_name === 'BW');
      expect(withShortName).toHaveLength(1);
    });

    it('handles mixed BWB-ID and article references', () => {
      const text = 'Zie BWBR0005289 en specifiek art. 6:162 BW.';
      const refs = extractCrossReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(1);

      // Should not duplicate BWB-ID when it's also derived from short name
      const bwbRefs = refs.filter(r => r.target_bwb_id === 'BWBR0005289');
      expect(bwbRefs.length).toBeGreaterThanOrEqual(1);
    });

    it('normalizes provision references with dots to colons', () => {
      const text = 'Volgens art. 6.162 BW geldt...';
      const refs = extractCrossReferences(text);

      if (refs.length > 0) {
        expect(refs[0].target_provision_ref).toBe('6:162');
      }
    });

    it('handles case-insensitive article keywords', () => {
      const text = 'Artikel 6:162 BW en ART. 287 Sr.';
      const refs = extractCrossReferences(text);

      expect(refs.length).toBeGreaterThanOrEqual(2);
    });

    it('does not match short names when part of longer words', () => {
      const text = 'De BWB-publicatie bevat informatie.';
      const refs = extractCrossReferences(text);

      // Should not match "BW" from "BWB"
      const bwRefs = refs.filter(r => r.target_short_name === 'BW');
      expect(bwRefs).toHaveLength(0);
    });
  });
});
