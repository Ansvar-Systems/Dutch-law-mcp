/**
 * Per-id toestand resolver (PR #117 review fix).
 *
 * The repository's un-versioned XML URL
 * (https://repository.officiele-overheidspublicaties.nl/bwb/<id>/xml/<id>.xml)
 * 301-redirects to the OLDEST toestand of the document — verified live
 * 2026-06-10: BWBR0001827 -> 2002-01-01_0 while 121 newer consolidations
 * exist. Fetching by plain URL therefore acquires stale law for every
 * multi-toestand document. The correct acquisition path is: query SRU for the
 * id, select the newest in-force toestand, fetch that URL.
 *
 * Returns null only when the id has ZERO records upstream (genuinely absent).
 * Every transport or shape problem THROWS — transient failure must never be
 * conflated with "document gone".
 */

import { parseSruResponse } from './sru-response.js';
import { selectCurrentToestandRecord, parseToestandFromUrl, toestandKey } from './toestand.js';

const SRU_BASE = 'https://zoekservice.overheid.nl/sru/Search';
const SRU_ID_PAGE_SIZE = 1000;

export interface ResolvedDoc {
  bwbId: string;
  title: string;
  /** URL of the newest in-force toestand; null when the record carries none. */
  toestandUrl: string | null;
  /** Stamp form of that toestand, e.g. '2026-01-01_0'; null when unknown. */
  toestand: string | null;
  /** OWMS modified date (document-level). */
  modified: string | null;
  recordCount: number;
}

export async function resolveNewestToestand(
  bwbId: string,
  opts: {
    fetchImpl?: typeof fetch;
    sruBase?: string;
    today?: string;
  } = {},
): Promise<ResolvedDoc | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const url = new URL(opts.sruBase ?? SRU_BASE);
  url.searchParams.set('operation', 'searchRetrieve');
  url.searchParams.set('version', '1.2');
  url.searchParams.set('x-connection', 'BWB');
  url.searchParams.set('query', `dcterms.identifier==${bwbId}`);
  url.searchParams.set('maximumRecords', String(SRU_ID_PAGE_SIZE));

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`SRU id lookup for ${bwbId} failed: HTTP ${response.status}`);
  }

  const page = parseSruResponse(await response.text());
  if (page.totalRecords === 0 && page.rawCount === 0) {
    return null; // genuinely absent upstream
  }
  if (page.totalRecords != null && page.totalRecords > page.rawCount) {
    throw new Error(
      `SRU id lookup for ${bwbId} returned ${page.rawCount} of ${page.totalRecords} declared records — refusing a truncated toestand list`,
    );
  }
  if (page.records.length === 0) {
    throw new Error(
      `SRU id lookup for ${bwbId} returned ${page.rawCount} records but none yielded a BWB id`,
    );
  }

  const chosen = selectCurrentToestandRecord(page.records, today);
  if (!chosen) return null;

  const version = parseToestandFromUrl(chosen.toestandUrl);
  return {
    bwbId,
    title: chosen.title,
    toestandUrl: chosen.toestandUrl ?? null,
    toestand: version ? toestandKey(version) : null,
    modified: chosen.modified,
    recordCount: page.records.length,
  };
}
