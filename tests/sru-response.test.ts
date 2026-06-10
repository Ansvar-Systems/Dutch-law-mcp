import { describe, it, expect } from 'vitest';
import { parseSruResponse } from '../src/ingest/sru-response.js';

// Shared SRU response parser (PR #117 review fix). Extracted from the inline
// parsing in scripts/ingest-bwb.ts so that (a) the per-id resolver can reuse
// it and (b) extraction failures become measurable: a record that yields no
// BWB id is COUNTED (droppedCount) instead of silently skipped — a page whose
// records all lose their ids must look broken, not healthy.

const record = (opts: { id?: string; title?: string; modified?: string; toestand?: string }) => `
  <srw:record>
    <srw:recordData>
      <gzd xmlns:dcterms="http://purl.org/dc/terms/" xmlns:overheidbwb="http://standaarden.overheid.nl/bwb/terms/">
        <originalData>
          <overheidbwb:meta>
            <owmskern>
              ${opts.id ? `<dcterms:identifier>${opts.id}</dcterms:identifier>` : ''}
              ${opts.title ? `<dcterms:title>${opts.title}</dcterms:title>` : ''}
              ${opts.modified ? `<dcterms:modified>${opts.modified}</dcterms:modified>` : ''}
            </owmskern>
          </overheidbwb:meta>
        </originalData>
        <enrichedData>
          ${opts.toestand ? `<overheidbwb:locatie_toestand>${opts.toestand}</overheidbwb:locatie_toestand>` : ''}
        </enrichedData>
      </gzd>
    </srw:recordData>
  </srw:record>`;

const page = (
  records: string[],
  opts: { total?: string; next?: string } = {},
) => `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:version>1.2</srw:version>
  ${opts.total !== undefined ? `<srw:numberOfRecords>${opts.total}</srw:numberOfRecords>` : ''}
  ${records.length ? `<srw:records>${records.join('')}</srw:records>` : ''}
  ${opts.next !== undefined ? `<srw:nextRecordPosition>${opts.next}</srw:nextRecordPosition>` : ''}
</srw:searchRetrieveResponse>`;

const TOESTAND_URL =
  'https://repository.officiele-overheidspublicaties.nl/bwb/BWBR0001854/2002-04-01_0/xml/BWBR0001854_2002-04-01_0.xml';

describe('parseSruResponse', () => {
  it('extracts id, title, modified and toestand URL from records', () => {
    const out = parseSruResponse(
      page(
        [
          record({
            id: 'BWBR0001854',
            title: 'Wetboek van Strafrecht',
            modified: '2024-05-24',
            toestand: TOESTAND_URL,
          }),
        ],
        { total: '125', next: '2' },
      ),
    );
    expect(out.records).toEqual([
      {
        bwbId: 'BWBR0001854',
        title: 'Wetboek van Strafrecht',
        modified: '2024-05-24',
        toestandUrl: TOESTAND_URL,
        validityEnd: null,
      },
    ]);
    expect(out.rawCount).toBe(1);
    expect(out.droppedCount).toBe(0);
    expect(out.totalRecords).toBe(125);
    expect(out.nextRecordPosition).toBe(2);
  });

  it('counts records that yield no BWB id as dropped instead of silently skipping them', () => {
    const out = parseSruResponse(
      page([record({ title: 'Naamloos' }), record({ id: 'BWBR0000001' })], { total: '2' }),
    );
    expect(out.records.map((r) => r.bwbId)).toEqual(['BWBR0000001']);
    expect(out.rawCount).toBe(2);
    expect(out.droppedCount).toBe(1);
  });

  it('falls back to extracting the BWB id from the toestand URL', () => {
    const out = parseSruResponse(page([record({ toestand: TOESTAND_URL })], { total: '1' }));
    expect(out.records[0]?.bwbId).toBe('BWBR0001854');
    expect(out.droppedCount).toBe(0);
  });

  it('reports a missing numberOfRecords as null, never as 0', () => {
    const out = parseSruResponse(page([record({ id: 'BWBR0000001' })]));
    expect(out.totalRecords).toBeNull();
  });

  it('reports an unparseable numberOfRecords as null', () => {
    const out = parseSruResponse(page([record({ id: 'BWBR0000001' })], { total: 'soon' }));
    expect(out.totalRecords).toBeNull();
  });

  it('returns null nextRecordPosition on the last page', () => {
    const out = parseSruResponse(page([record({ id: 'BWBR0000001' })], { total: '1' }));
    expect(out.nextRecordPosition).toBeNull();
  });

  it('throws on a response that is not an SRU searchRetrieveResponse', () => {
    expect(() => parseSruResponse('<html><body>throttled</body></html>')).toThrow(/SRU/);
  });
});

describe('parseSruResponse — round-2 hardening (delta review)', () => {
  // Live-reproduced: the real type=wet result set contains BWBW-prefixed laws
  // (BWBW5113, BWBW7972) that a BWB[RV]-only regex drops — and a droppedCount
  // health gate then kills every sweep run on a deterministic condition.
  it('accepts BWBW (and any BWB+letter) identifiers', () => {
    const out = parseSruResponse(
      page([record({ id: 'BWBW5113', title: 'Afschaffingswet', modified: '2017-01-23' })], {
        total: '1',
      }),
    );
    expect(out.records[0]?.bwbId).toBe('BWBW5113');
    expect(out.droppedCount).toBe(0);
  });

  it('treats an EMPTY numberOfRecords element as null, never 0', () => {
    // fast-xml-parser yields '' for <numberOfRecords/>; Number('') === 0 would
    // satisfy "zero records upstream" and classify a live statute as GONE.
    const xml = page([record({ id: 'BWBR0000001' })], { total: '' });
    expect(parseSruResponse(xml).totalRecords).toBeNull();
  });

  it('treats an empty or zero nextRecordPosition as null (SRU positions are 1-based)', () => {
    const empty = parseSruResponse(page([record({ id: 'BWBR0000001' })], { total: '1', next: '' }));
    expect(empty.nextRecordPosition).toBeNull();
    const zero = parseSruResponse(page([record({ id: 'BWBR0000001' })], { total: '1', next: '0' }));
    expect(zero.nextRecordPosition).toBeNull();
  });

  it('throws when the response carries SRU diagnostics (backend failure, not data)', () => {
    const xml = `<?xml version="1.0"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:numberOfRecords>0</srw:numberOfRecords>
  <srw:diagnostics><diagnostic><message>System temporarily unavailable</message></diagnostic></srw:diagnostics>
</srw:searchRetrieveResponse>`;
    expect(() => parseSruResponse(xml)).toThrow(/diagnostic/i);
  });

  it('extracts the validity end date (geldigheidsperiode_einddatum) when present', () => {
    const xml = `<?xml version="1.0"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:numberOfRecords>1</srw:numberOfRecords>
  <srw:records><srw:record><srw:recordData><gzd xmlns:dcterms="http://purl.org/dc/terms/" xmlns:overheidbwb="http://standaarden.overheid.nl/bwb/terms/">
    <originalData><overheidbwb:meta>
      <owmskern><dcterms:identifier>BWBR0002024</dcterms:identifier><dcterms:title>Oud besluit</dcterms:title></owmskern>
      <bwbipm><overheidbwb:geldigheidsperiode_einddatum>2007-01-31</overheidbwb:geldigheidsperiode_einddatum></bwbipm>
    </overheidbwb:meta></originalData>
    <enrichedData><overheidbwb:locatie_toestand>https://repository.officiele-overheidspublicaties.nl/bwb/BWBR0002024/1997-12-24_0/xml/BWBR0002024_1997-12-24_0.xml</overheidbwb:locatie_toestand></enrichedData>
  </gzd></srw:recordData></srw:record></srw:records>
</srw:searchRetrieveResponse>`;
    const out = parseSruResponse(xml);
    expect(out.records[0]?.validityEnd).toBe('2007-01-31');
  });

  it('reports null validityEnd when the record has no end date', () => {
    const out = parseSruResponse(page([record({ id: 'BWBR0000001' })], { total: '1' }));
    expect(out.records[0]?.validityEnd).toBeNull();
  });
});
