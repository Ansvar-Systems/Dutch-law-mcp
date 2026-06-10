import { describe, it, expect, vi } from 'vitest';
import { resolveNewestToestand } from '../src/ingest/sru-resolve.js';

// Per-id toestand resolver (PR #117 review fix). The repository's un-versioned
// XML URL 301-redirects to the OLDEST toestand, so any script fetching by
// plain URL (backfill, single-id ingest) acquires stale law. The only correct
// acquisition path is: query SRU for the id, select the newest in-force
// toestand, fetch that URL.

const rec = (id: string, toestand: string, modified = '2024-05-24') => `
  <srw:record><srw:recordData><gzd xmlns:dcterms="http://purl.org/dc/terms/" xmlns:overheidbwb="http://standaarden.overheid.nl/bwb/terms/">
    <originalData><overheidbwb:meta><owmskern>
      <dcterms:identifier>${id}</dcterms:identifier>
      <dcterms:title>Testwet</dcterms:title>
      <dcterms:modified>${modified}</dcterms:modified>
    </owmskern></overheidbwb:meta></originalData>
    <enrichedData><overheidbwb:locatie_toestand>https://repository.officiele-overheidspublicaties.nl/bwb/${id}/${toestand}/xml/${id}_${toestand}.xml</overheidbwb:locatie_toestand></enrichedData>
  </gzd></srw:recordData></srw:record>`;

const sruXml = (total: number, records: string[]) => `<?xml version="1.0"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:numberOfRecords>${total}</srw:numberOfRecords>
  ${records.length ? `<srw:records>${records.join('')}</srw:records>` : ''}
</srw:searchRetrieveResponse>`;

const okResponse = (body: string) =>
  ({ ok: true, status: 200, text: () => Promise.resolve(body) }) as unknown as Response;

describe('resolveNewestToestand', () => {
  it('selects the newest in-force toestand, not the first record', async () => {
    const body = sruXml(3, [
      rec('BWBR0001854', '2002-04-01_0'),
      rec('BWBR0001854', '2019-01-01_0'),
      rec('BWBR0001854', '2026-01-01_0'),
    ]);
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(body));
    const out = await resolveNewestToestand('BWBR0001854', {
      fetchImpl,
      today: '2026-06-10',
    });
    expect(out?.toestand).toBe('2026-01-01_0');
    expect(out?.toestandUrl).toContain('2026-01-01_0');
    expect(out?.modified).toBe('2024-05-24');
    expect(out?.title).toBe('Testwet');
    const calledUrl = String(fetchImpl.mock.calls[0][0]);
    expect(calledUrl).toContain('BWBR0001854');
  });

  it('returns null when the id has zero records upstream (genuinely absent)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(sruXml(0, [])));
    expect(await resolveNewestToestand('BWBR9999999', { fetchImpl })).toBeNull();
  });

  it('throws on an HTTP failure instead of soft-failing (transient != gone)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('') });
    await expect(resolveNewestToestand('BWBR0001854', { fetchImpl })).rejects.toThrow(/503/);
  });

  it('throws when the declared total exceeds the returned records (truncated page)', async () => {
    const body = sruXml(2000, [rec('BWBR0001854', '2002-04-01_0')]);
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(body));
    await expect(resolveNewestToestand('BWBR0001854', { fetchImpl })).rejects.toThrow(/2000/);
  });
});
