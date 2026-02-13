import { describe, it, expect } from 'vitest';
import { extractEUReferences } from '../../src/parsers/eu-reference-parser.js';

describe('extractEUReferences', () => {
  it('should extract modern-style regulation reference', () => {
    const text = 'Verordening (EU) 2016/679 van het Europees Parlement';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe('regulation');
    expect(refs[0].year).toBe(2016);
    expect(refs[0].number).toBe(679);
    expect(refs[0].community).toBe('EU');
    expect(refs[0].reference_type).toBe('references');
  });

  it('should extract modern-style directive reference', () => {
    const text = 'Richtlijn (EU) 2019/770 inzake digitale inhoud';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe('directive');
    expect(refs[0].year).toBe(2019);
    expect(refs[0].number).toBe(770);
    expect(refs[0].community).toBe('EU');
  });

  it('should extract old-style EG directive reference', () => {
    const text = 'Richtlijn 95/46/EG betreffende de bescherming van persoonsgegevens';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe('directive');
    expect(refs[0].year).toBe(1995);
    expect(refs[0].number).toBe(46);
    expect(refs[0].community).toBe('EG');
  });

  it('should extract article reference with regulation', () => {
    const text = 'artikel 51 van Verordening (EU) 2016/679';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe('regulation');
    expect(refs[0].article).toBe('51');
    expect(refs[0].year).toBe(2016);
    expect(refs[0].number).toBe(679);
  });

  it('should extract article reference with dot notation', () => {
    const text = 'artikel 6.1.c van Verordening (EU) 2016/679';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].article).toBe('6.1.c');
  });

  it('should classify "ter uitvoering van" as implements', () => {
    const text = 'Deze wet strekt ter uitvoering van Verordening (EU) 2016/679.';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].reference_type).toBe('implements');
  });

  it('should classify "ter aanvulling van" as supplements', () => {
    const text = 'ter aanvulling van Richtlijn (EU) 2019/770';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].reference_type).toBe('supplements');
  });

  it('should classify "op grond van" as applies', () => {
    const text = 'op grond van Verordening (EU) 2016/679';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].reference_type).toBe('applies');
  });

  it('should default to references without classification keyword', () => {
    const text = 'Verordening (EU) 2016/679 is van toepassing.';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].reference_type).toBe('references');
  });

  it('should extract multiple references from text', () => {
    const text = 'Verordening (EU) 2016/679 en Richtlijn 95/46/EG zijn relevant.';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(2);
    const types = refs.map(r => r.type);
    expect(types).toContain('regulation');
    expect(types).toContain('directive');
  });

  it('should deduplicate identical references', () => {
    const text = 'Verordening (EU) 2016/679 is belangrijk. Verordening (EU) 2016/679 is van toepassing.';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(1);
  });

  it('should return empty array for text without EU references', () => {
    const text = 'Dit is een reguliere Nederlandse wettekst zonder EU verwijzingen.';
    const refs = extractEUReferences(text);
    expect(refs).toHaveLength(0);
  });

  it('should preserve raw_match', () => {
    const text = 'Verordening (EU) 2016/679 van het Europees Parlement';
    const refs = extractEUReferences(text);
    expect(refs[0].raw_match).toBe('Verordening (EU) 2016/679');
  });

  it('should handle two-digit years for old-style references', () => {
    const text = 'Richtlijn 95/46/EG';
    const refs = extractEUReferences(text);
    expect(refs[0].year).toBe(1995);
  });

  it('should extract from real UAVG article 1 text', () => {
    const text = 'Verordening (EU) 2016/679 van het Europees Parlement en de Raad van 27 april 2016 betreffende de bescherming van natuurlijke personen in verband met de verwerking van persoonsgegevens en betreffende het vrije verkeer van die gegevens en tot intrekking van Richtlijn 95/46/EG (algemene verordening gegevensbescherming).';
    const refs = extractEUReferences(text);
    expect(refs.length).toBeGreaterThanOrEqual(2);

    const regulation = refs.find(r => r.type === 'regulation');
    expect(regulation).toBeDefined();
    expect(regulation!.year).toBe(2016);
    expect(regulation!.number).toBe(679);

    const directive = refs.find(r => r.type === 'directive');
    expect(directive).toBeDefined();
    expect(directive!.year).toBe(1995);
    expect(directive!.number).toBe(46);
  });
});
