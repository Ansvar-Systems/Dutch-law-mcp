import type { Database } from '@ansvar/mcp-sqlite';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetProvisionAtDateInput {
  document_id: string;
  provision_ref: string;
  date: string;
  include_amendments?: boolean;
}

export interface AmendmentRecord {
  source_document_id: string;
  amendment_date: string | null;
  ref_type: string;
}

export interface ProvisionVersion {
  provision_ref: string;
  book: string | null;
  chapter: string | null;
  section: string | null;
  article: string;
  title: string | null;
  content: string;
  valid_from: string | null;
  valid_to: string | null;
  status: 'current' | 'historical' | 'future' | 'not_found';
  amendments?: AmendmentRecord[];
}

function determineProvisionStatus(
  validFrom: string | null,
  validTo: string | null,
  queryDate: string,
): 'current' | 'historical' | 'future' | 'not_found' {
  const today = new Date().toISOString().slice(0, 10);

  // If no valid_from, treat as current for now
  if (validFrom && queryDate < validFrom) {
    return 'future';
  }

  if (validTo && queryDate >= validTo) {
    return 'historical';
  }

  // Check if it's current as of today
  const isCurrentToday = (!validFrom || validFrom <= today) && (!validTo || validTo > today);

  if (isCurrentToday) {
    return 'current';
  }

  if (validTo && today >= validTo) {
    return 'historical';
  }

  return 'current';
}

function getAmendments(
  db: Database,
  documentId: string,
  provisionRef: string,
): AmendmentRecord[] {
  const sql = `
    SELECT
      source_document_id,
      ref_type
    FROM cross_references
    WHERE target_document_id = ?
      AND target_provision_ref = ?
      AND ref_type = 'amended_by'
  `;

  const rows = db.prepare(sql).all(documentId, provisionRef) as Array<{
    source_document_id: string;
    ref_type: string;
  }>;

  return rows.map(row => ({
    source_document_id: row.source_document_id,
    amendment_date: null,
    ref_type: row.ref_type,
  }));
}

export async function getProvisionAtDate(
  db: Database,
  input: GetProvisionAtDateInput,
): Promise<ToolResponse<ProvisionVersion>> {
  const { document_id, provision_ref, include_amendments } = input;
  const queryDate = normalizeAsOfDate(input.date);

  if (!queryDate) {
    throw new Error('date parameter is required and must be in YYYY-MM-DD format');
  }

  const sql = `
    SELECT
      provision_ref,
      book,
      chapter,
      section,
      article,
      title,
      content,
      valid_from,
      valid_to
    FROM legal_provision_versions
    WHERE document_id = ?
      AND provision_ref = ?
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to > ?)
    ORDER BY valid_from DESC
    LIMIT 1
  `;

  const row = db.prepare(sql).get(
    document_id,
    provision_ref,
    queryDate,
    queryDate,
  ) as {
    provision_ref: string;
    book: string | null;
    chapter: string | null;
    section: string | null;
    article: string;
    title: string | null;
    content: string;
    valid_from: string | null;
    valid_to: string | null;
  } | undefined;

  if (!row) {
    // Check if there's a future version
    const futureSql = `
      SELECT
        provision_ref,
        book,
        chapter,
        section,
        article,
        title,
        content,
        valid_from,
        valid_to
      FROM legal_provision_versions
      WHERE document_id = ?
        AND provision_ref = ?
        AND valid_from > ?
      ORDER BY valid_from ASC
      LIMIT 1
    `;

    const futureRow = db.prepare(futureSql).get(
      document_id,
      provision_ref,
      queryDate,
    ) as {
      provision_ref: string;
      book: string | null;
      chapter: string | null;
      section: string | null;
      article: string;
      title: string | null;
      content: string;
      valid_from: string | null;
      valid_to: string | null;
    } | undefined;

    if (futureRow) {
      return {
        results: {
          provision_ref: futureRow.provision_ref,
          book: futureRow.book,
          chapter: futureRow.chapter,
          section: futureRow.section,
          article: futureRow.article,
          title: futureRow.title,
          content: futureRow.content,
          valid_from: futureRow.valid_from,
          valid_to: futureRow.valid_to,
          status: 'future',
        },
        _metadata: generateResponseMetadata(db),
      };
    }

    return {
      results: {
        provision_ref,
        book: null,
        chapter: null,
        section: null,
        article: provision_ref,
        title: null,
        content: '',
        valid_from: null,
        valid_to: null,
        status: 'not_found',
      },
      _metadata: generateResponseMetadata(db),
    };
  }

  const status = determineProvisionStatus(row.valid_from, row.valid_to, queryDate);

  const result: ProvisionVersion = {
    provision_ref: row.provision_ref,
    book: row.book,
    chapter: row.chapter,
    section: row.section,
    article: row.article,
    title: row.title,
    content: row.content,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    status,
  };

  if (include_amendments) {
    result.amendments = getAmendments(db, document_id, provision_ref);
  }

  return {
    results: result,
    _metadata: generateResponseMetadata(db),
  };
}

export async function getCurrentProvision(
  db: Database,
  documentId: string,
  provisionRef: string,
): Promise<ToolResponse<ProvisionVersion>> {
  const today = new Date().toISOString().slice(0, 10);
  return getProvisionAtDate(db, {
    document_id: documentId,
    provision_ref: provisionRef,
    date: today,
  });
}

export async function getAllVersions(
  db: Database,
  documentId: string,
  provisionRef: string,
): Promise<ToolResponse<ProvisionVersion[]>> {
  const sql = `
    SELECT
      provision_ref,
      book,
      chapter,
      section,
      article,
      title,
      content,
      valid_from,
      valid_to
    FROM legal_provision_versions
    WHERE document_id = ?
      AND provision_ref = ?
    ORDER BY valid_from ASC
  `;

  const rows = db.prepare(sql).all(documentId, provisionRef) as Array<{
    provision_ref: string;
    book: string | null;
    chapter: string | null;
    section: string | null;
    article: string;
    title: string | null;
    content: string;
    valid_from: string | null;
    valid_to: string | null;
  }>;

  const today = new Date().toISOString().slice(0, 10);

  const results: ProvisionVersion[] = rows.map(row => ({
    provision_ref: row.provision_ref,
    book: row.book,
    chapter: row.chapter,
    section: row.section,
    article: row.article,
    title: row.title,
    content: row.content,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    status: determineProvisionStatus(row.valid_from, row.valid_to, today),
  }));

  return {
    results,
    _metadata: generateResponseMetadata(db),
  };
}

export async function diffProvisionDates(
  db: Database,
  documentId: string,
  provisionRef: string,
  date1: string,
  date2: string,
): Promise<ToolResponse<{ changed: boolean; version1: ProvisionVersion; version2: ProvisionVersion }>> {
  const normalizedDate1 = normalizeAsOfDate(date1);
  const normalizedDate2 = normalizeAsOfDate(date2);

  if (!normalizedDate1 || !normalizedDate2) {
    throw new Error('Both dates must be provided in YYYY-MM-DD format');
  }

  const result1 = await getProvisionAtDate(db, {
    document_id: documentId,
    provision_ref: provisionRef,
    date: normalizedDate1,
  });

  const result2 = await getProvisionAtDate(db, {
    document_id: documentId,
    provision_ref: provisionRef,
    date: normalizedDate2,
  });

  const version1 = result1.results;
  const version2 = result2.results;

  const changed = version1.content !== version2.content ||
                  version1.title !== version2.title ||
                  version1.valid_from !== version2.valid_from;

  return {
    results: {
      changed,
      version1,
      version2,
    },
    _metadata: generateResponseMetadata(db),
  };
}
