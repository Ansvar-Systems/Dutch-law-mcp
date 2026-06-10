/**
 * Shared parser for SRU searchRetrieveResponse pages from
 * zoekservice.overheid.nl (x-connection=BWB).
 *
 * Extracted from scripts/ingest-bwb.ts (PR #117 review fix) so the per-id
 * resolver reuses one extraction path and so extraction failures are
 * MEASURABLE: a raw record that yields no BWB id increments droppedCount
 * instead of vanishing — a page whose records all lose their ids must look
 * broken to the retry/completeness machinery, never healthy.
 */

import { XMLParser } from 'fast-xml-parser';

export interface SruDocRecord {
  bwbId: string;
  title: string;
  toestandUrl?: string;
  modified: string | null;
}

export interface ParsedSruPage {
  records: SruDocRecord[];
  /** Raw record count as returned by the service, before extraction. */
  rawCount: number;
  /** Raw records from which no BWB id could be extracted. */
  droppedCount: number;
  /** Declared numberOfRecords; null when missing or unparseable. */
  totalRecords: number | null;
  nextRecordPosition: number | null;
}

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function textOf(node: unknown): string | null {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object') {
    const text = (node as Record<string, unknown>)['#text'];
    if (typeof text === 'string') return text;
    if (typeof text === 'number') return String(text);
  }
  return null;
}

export function parseSruResponse(xml: string): ParsedSruPage {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  });

  const doc = parser.parse(xml) as Record<string, unknown>;
  const response = doc['searchRetrieveResponse'] as Record<string, unknown> | undefined;
  if (!response) {
    throw new Error('Response is not an SRU searchRetrieveResponse (malformed or throttled)');
  }

  const totalText = textOf(response['numberOfRecords']);
  const totalParsed = totalText == null ? Number.NaN : Number(totalText);
  const totalRecords = Number.isInteger(totalParsed) && totalParsed >= 0 ? totalParsed : null;

  const nextText = textOf(response['nextRecordPosition']);
  const nextParsed = nextText == null ? Number.NaN : Number(nextText);
  const nextRecordPosition = Number.isFinite(nextParsed) ? nextParsed : null;

  const recordsContainer = response['records'] as Record<string, unknown> | undefined;
  const rawRecords = recordsContainer ? toArray(recordsContainer['record']) : [];

  const records: SruDocRecord[] = [];
  let droppedCount = 0;

  for (const rawRecord of rawRecords) {
    if (rawRecord == null || typeof rawRecord !== 'object') {
      droppedCount++;
      continue;
    }
    const rec = rawRecord as Record<string, unknown>;
    const recordData = rec['recordData'] as Record<string, unknown> | undefined;
    const gzd = recordData?.['gzd'] as Record<string, unknown> | undefined;
    const originalData = gzd?.['originalData'] as Record<string, unknown> | undefined;
    const enrichedData = gzd?.['enrichedData'] as Record<string, unknown> | undefined;

    let bwbId = '';
    let title = '';
    let modified: string | null = null;
    let toestandUrl: string | undefined;

    if (originalData) {
      // The SRU response wraps owmskern inside overheidbwb:meta ('meta' after NS removal).
      const meta = originalData['meta'] as Record<string, unknown> | undefined;
      const owmsKern = (meta?.['owmskern'] ??
        originalData['owmskern'] ??
        originalData['owms-kern']) as Record<string, unknown> | undefined;

      if (owmsKern) {
        const idStr = textOf(owmsKern['identifier']) ?? '';
        const match = idStr.match(/BWB[RV]\d+/);
        if (match) bwbId = match[0];
        title = textOf(owmsKern['title']) ?? '';
        modified = textOf(owmsKern['modified']);
      }
    }

    if (enrichedData) {
      const locatie = enrichedData['locatie_toestand'];
      if (typeof locatie === 'string') toestandUrl = locatie;
      // Fallback: extract the BWB id from the toestand URL.
      if (!bwbId && toestandUrl) {
        const match = toestandUrl.match(/BWB[RV]\d+/);
        if (match) bwbId = match[0];
      }
    }

    if (bwbId) {
      records.push({ bwbId, title, toestandUrl, modified });
    } else {
      droppedCount++;
    }
  }

  return { records, rawCount: rawRecords.length, droppedCount, totalRecords, nextRecordPosition };
}
