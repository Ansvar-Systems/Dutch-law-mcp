import { describe, it, expect } from 'vitest';
import { parseBwbXml } from '../../src/parsers/bwb-xml-parser.js';

// Sample XML: BW-style article with boek (numeric nr attribute)
const BW_ARTICLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wet-besluit>
  <wetgeving bwb-id="BWBR0005289">
    <intitule>Burgerlijk Wetboek Boek 6</intitule>
    <wettekst>
      <boek nr="6">
        <kop><nr>6</nr><titel>Algemeen gedeelte van het verbintenissenrecht</titel></kop>
        <titeldeel>
          <afdeling>
            <paragraaf>
              <artikel nr="162">
                <kop><nr>162</nr><titel>Onrechtmatige daad</titel></kop>
                <lid nr="1">
                  <al>Hij die jegens een ander een onrechtmatige daad pleegt, welke hem kan worden toegerekend, is verplicht de schade die de ander dientengevolge lijdt, te vergoeden.</al>
                </lid>
                <lid nr="2">
                  <al>Als onrechtmatige daad worden aangemerkt een inbreuk op een recht en een doen of nalaten in strijd met een wettelijke plicht of met hetgeen volgens ongeschreven recht in het maatschappelijk verkeer betaamt, een en ander behoudens de aanwezigheid van een rechtvaardigingsgrond.</al>
                </lid>
                <lid nr="3">
                  <al>Een onrechtmatige daad kan aan de dader worden toegerekend, indien zij te wijten is aan zijn schuld of aan een oorzaak welke krachtens de wet of de in het verkeer geldende opvattingen voor zijn rekening komt.</al>
                </lid>
              </artikel>
            </paragraaf>
          </afdeling>
        </titeldeel>
      </boek>
    </wettekst>
  </wetgeving>
</wet-besluit>`;

// Sample XML: Flat statute (Sr) with text-based boek nr (Roman numerals)
const SR_ARTICLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wet-besluit>
  <wetgeving bwb-id="BWBR0001854">
    <intitule>Wetboek van Strafrecht</intitule>
    <wettekst>
      <boek>
        <kop><nr>Tweede Boek</nr><titel>Misdrijven</titel></kop>
        <titeldeel>
          <kop><nr>XIX</nr><titel>Misdrijven tegen het leven gericht</titel></kop>
          <artikel nr="287">
            <kop><nr>287</nr><titel>Doodslag</titel></kop>
            <lid nr="1">
              <al>Hij die opzettelijk een ander van het leven berooft, wordt, als schuldig aan doodslag, gestraft met gevangenisstraf van ten hoogste vijftien jaren of geldboete van de vijfde categorie.</al>
            </lid>
          </artikel>
        </titeldeel>
      </boek>
    </wettekst>
  </wetgeving>
</wet-besluit>`;

// Sample XML: Article with multiple lid elements
const MULTI_LID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wet-besluit>
  <wetgeving bwb-id="BWBR0005291">
    <intitule>Burgerlijk Wetboek Boek 7</intitule>
    <wettekst>
      <boek nr="7">
        <kop><nr>7</nr><titel>Bijzondere overeenkomsten</titel></kop>
        <titeldeel>
          <artikel nr="1">
            <kop><nr>1</nr><titel>Koop</titel></kop>
            <lid nr="1">
              <al>Koop is de overeenkomst waarbij de een zich verbindt een zaak te geven en de ander om daarvoor een prijs in geld te betalen.</al>
            </lid>
            <lid nr="2">
              <al>Koop kan ook betrekking hebben op vermogensrechten.</al>
            </lid>
          </artikel>
        </titeldeel>
      </boek>
    </wettekst>
  </wetgeving>
</wet-besluit>`;

// Sample XML: Article with no content (empty)
const EMPTY_ARTICLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wet-besluit>
  <wetgeving bwb-id="BWBR0099999">
    <intitule>Test Wet</intitule>
    <wettekst>
      <artikel nr="1">
        <kop><nr>1</nr></kop>
      </artikel>
    </wettekst>
  </wetgeving>
</wet-besluit>`;

// Sample XML: Flat statute without any boek
const FLAT_STATUTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wet-besluit>
  <wetgeving bwb-id="BWBR0001840">
    <intitule>Grondwet</intitule>
    <wettekst>
      <artikel nr="1">
        <kop><nr>1</nr><titel>Gelijkheidsbeginsel</titel></kop>
        <lid nr="1">
          <al>Allen die zich in Nederland bevinden, worden in gelijke gevallen gelijk behandeld.</al>
        </lid>
      </artikel>
      <artikel nr="2">
        <kop><nr>2</nr><titel>Nederlanderschap</titel></kop>
        <lid nr="1">
          <al>De wet regelt wie Nederlander is.</al>
        </lid>
        <lid nr="2">
          <al>De wet regelt de toelating en de uitzetting van vreemdelingen.</al>
        </lid>
      </artikel>
    </wettekst>
  </wetgeving>
</wet-besluit>`;

// Sample XML: Article with direct al (no lid)
const DIRECT_AL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wet-besluit>
  <wetgeving bwb-id="BWBR0012345">
    <intitule>Test Wet Direct Al</intitule>
    <wettekst>
      <artikel nr="10">
        <kop><nr>10</nr><titel>Toepassingsbereik</titel></kop>
        <al>Deze wet is van toepassing op alle rechtsverhoudingen.</al>
      </artikel>
    </wettekst>
  </wetgeving>
</wet-besluit>`;

// Sample XML: Multiple articles across hierarchy
const MULTIPLE_ARTICLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wet-besluit>
  <wetgeving bwb-id="BWBR0005289">
    <intitule>Burgerlijk Wetboek Boek 6</intitule>
    <wettekst>
      <boek nr="6">
        <kop><nr>6</nr><titel>Verbintenissenrecht</titel></kop>
        <titeldeel>
          <afdeling>
            <paragraaf>
              <artikel nr="162">
                <kop><nr>162</nr><titel>Onrechtmatige daad</titel></kop>
                <lid nr="1">
                  <al>Hij die jegens een ander een onrechtmatige daad pleegt...</al>
                </lid>
              </artikel>
              <artikel nr="163">
                <kop><nr>163</nr><titel>Toerekening</titel></kop>
                <lid nr="1">
                  <al>Degene die op grond van de twee vorige artikelen aansprakelijk is...</al>
                </lid>
              </artikel>
            </paragraaf>
          </afdeling>
        </titeldeel>
      </boek>
    </wettekst>
  </wetgeving>
</wet-besluit>`;

describe('parseBwbXml', () => {
  describe('BW-style article (with numeric boek)', () => {
    it('should extract BWB-ID from wetgeving attribute', () => {
      const result = parseBwbXml(BW_ARTICLE_XML);
      expect(result.bwb_id).toBe('BWBR0005289');
    });

    it('should extract title from intitule', () => {
      const result = parseBwbXml(BW_ARTICLE_XML);
      expect(result.title).toBe('Burgerlijk Wetboek Boek 6');
    });

    it('should extract provision with book:article format', () => {
      const result = parseBwbXml(BW_ARTICLE_XML);
      expect(result.provisions).toHaveLength(1);
      expect(result.provisions[0].provision_ref).toBe('6:162');
    });

    it('should set book from boek nr attribute', () => {
      const result = parseBwbXml(BW_ARTICLE_XML);
      expect(result.provisions[0].book).toBe('6');
    });

    it('should extract article number', () => {
      const result = parseBwbXml(BW_ARTICLE_XML);
      expect(result.provisions[0].article).toBe('162');
    });

    it('should extract article title', () => {
      const result = parseBwbXml(BW_ARTICLE_XML);
      expect(result.provisions[0].title).toBe('Onrechtmatige daad');
    });

    it('should extract content from all lid elements', () => {
      const result = parseBwbXml(BW_ARTICLE_XML);
      const content = result.provisions[0].content;
      expect(content).toContain('onrechtmatige daad pleegt');
      expect(content).toContain('inbreuk op een recht');
      expect(content).toContain('aan zijn schuld');
    });

    it('should prefix lid content with lid number', () => {
      const result = parseBwbXml(BW_ARTICLE_XML);
      const content = result.provisions[0].content;
      expect(content).toContain('1. Hij die jegens');
      expect(content).toContain('2. Als onrechtmatige daad');
      expect(content).toContain('3. Een onrechtmatige daad');
    });
  });

  describe('flat-style article (Sr with non-numeric boek)', () => {
    it('should extract BWB-ID', () => {
      const result = parseBwbXml(SR_ARTICLE_XML);
      expect(result.bwb_id).toBe('BWBR0001854');
    });

    it('should extract title', () => {
      const result = parseBwbXml(SR_ARTICLE_XML);
      expect(result.title).toBe('Wetboek van Strafrecht');
    });

    it('should NOT use non-numeric boek in provision_ref', () => {
      const result = parseBwbXml(SR_ARTICLE_XML);
      expect(result.provisions).toHaveLength(1);
      // "Tweede Boek" is not numeric, so provision_ref is just the article number
      expect(result.provisions[0].provision_ref).toBe('287');
    });

    it('should not set book for non-numeric boek nr', () => {
      const result = parseBwbXml(SR_ARTICLE_XML);
      expect(result.provisions[0].book).toBeUndefined();
    });

    it('should extract article title', () => {
      const result = parseBwbXml(SR_ARTICLE_XML);
      expect(result.provisions[0].title).toBe('Doodslag');
    });

    it('should extract chapter from titeldeel', () => {
      const result = parseBwbXml(SR_ARTICLE_XML);
      expect(result.provisions[0].chapter).toBe('XIX');
    });

    it('should extract content', () => {
      const result = parseBwbXml(SR_ARTICLE_XML);
      expect(result.provisions[0].content).toContain('opzettelijk een ander van het leven berooft');
    });
  });

  describe('article with multiple lid elements', () => {
    it('should extract content from all lid elements', () => {
      const result = parseBwbXml(MULTI_LID_XML);
      expect(result.provisions).toHaveLength(1);
      const content = result.provisions[0].content;
      expect(content).toContain('Koop is de overeenkomst');
      expect(content).toContain('vermogensrechten');
    });

    it('should prefix each lid with its number', () => {
      const result = parseBwbXml(MULTI_LID_XML);
      const content = result.provisions[0].content;
      expect(content).toContain('1. Koop is de overeenkomst');
      expect(content).toContain('2. Koop kan ook');
    });

    it('should use book:article format for numeric book', () => {
      const result = parseBwbXml(MULTI_LID_XML);
      expect(result.provisions[0].provision_ref).toBe('7:1');
      expect(result.provisions[0].book).toBe('7');
    });
  });

  describe('edge case: empty/missing content', () => {
    it('should handle article with no content gracefully', () => {
      const result = parseBwbXml(EMPTY_ARTICLE_XML);
      expect(result.provisions).toHaveLength(1);
      expect(result.provisions[0].article).toBe('1');
      expect(result.provisions[0].content).toBe('');
    });

    it('should set provision_ref without book prefix for flat statute', () => {
      const result = parseBwbXml(EMPTY_ARTICLE_XML);
      expect(result.provisions[0].provision_ref).toBe('1');
    });
  });

  describe('flat statute without boek', () => {
    it('should extract multiple articles', () => {
      const result = parseBwbXml(FLAT_STATUTE_XML);
      expect(result.provisions).toHaveLength(2);
    });

    it('should use plain article numbers as provision_ref', () => {
      const result = parseBwbXml(FLAT_STATUTE_XML);
      expect(result.provisions[0].provision_ref).toBe('1');
      expect(result.provisions[1].provision_ref).toBe('2');
    });

    it('should extract titles for each article', () => {
      const result = parseBwbXml(FLAT_STATUTE_XML);
      expect(result.provisions[0].title).toBe('Gelijkheidsbeginsel');
      expect(result.provisions[1].title).toBe('Nederlanderschap');
    });

    it('should extract content from all articles', () => {
      const result = parseBwbXml(FLAT_STATUTE_XML);
      expect(result.provisions[0].content).toContain('gelijk behandeld');
      expect(result.provisions[1].content).toContain('wie Nederlander is');
    });
  });

  describe('article with direct al (no lid)', () => {
    it('should extract content from direct al elements', () => {
      const result = parseBwbXml(DIRECT_AL_XML);
      expect(result.provisions).toHaveLength(1);
      expect(result.provisions[0].content).toContain('alle rechtsverhoudingen');
    });

    it('should not prefix with lid number for direct al', () => {
      const result = parseBwbXml(DIRECT_AL_XML);
      // Direct al has no lid prefix
      expect(result.provisions[0].content).toBe('Deze wet is van toepassing op alle rechtsverhoudingen.');
    });
  });

  describe('multiple articles in one document', () => {
    it('should extract all articles', () => {
      const result = parseBwbXml(MULTIPLE_ARTICLES_XML);
      expect(result.provisions).toHaveLength(2);
    });

    it('should give each article the correct provision_ref', () => {
      const result = parseBwbXml(MULTIPLE_ARTICLES_XML);
      expect(result.provisions[0].provision_ref).toBe('6:162');
      expect(result.provisions[1].provision_ref).toBe('6:163');
    });

    it('should extract title for each article', () => {
      const result = parseBwbXml(MULTIPLE_ARTICLES_XML);
      expect(result.provisions[0].title).toBe('Onrechtmatige daad');
      expect(result.provisions[1].title).toBe('Toerekening');
    });
  });

  describe('error handling', () => {
    it('should return empty result for empty XML', () => {
      const result = parseBwbXml('');
      expect(result.bwb_id).toBe('');
      expect(result.title).toBe('');
      expect(result.provisions).toHaveLength(0);
    });

    it('should return empty result for XML without wet-besluit', () => {
      const result = parseBwbXml('<?xml version="1.0"?><root></root>');
      expect(result.bwb_id).toBe('');
      expect(result.provisions).toHaveLength(0);
    });

    it('should return empty provisions for wet-besluit without wettekst', () => {
      const xml = `<?xml version="1.0"?>
        <wet-besluit>
          <wetgeving bwb-id="BWBR0001234">
            <intitule>Test</intitule>
          </wetgeving>
        </wet-besluit>`;
      const result = parseBwbXml(xml);
      expect(result.bwb_id).toBe('BWBR0001234');
      expect(result.title).toBe('Test');
      expect(result.provisions).toHaveLength(0);
    });
  });
});
