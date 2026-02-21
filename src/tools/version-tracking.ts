import type Database from '@ansvar/mcp-sqlite';

const PREMIUM_UPGRADE_MESSAGE =
  'Version tracking is available in the Ansvar Intelligence Portal. Contact hello@ansvar.ai for access.';

// --- Types ---

export interface GetProvisionHistoryInput {
  document_id: string;
  provision_ref: string;
}

export interface DiffProvisionInput {
  document_id: string;
  provision_ref: string;
  from_date: string;
  to_date?: string;
}

export interface GetRecentChangesInput {
  document_id?: string;
  since: string;
  limit?: number;
}

interface ProvisionVersion {
  effective_date: string | null;
  superseded_date: string | null;
  change_summary: string | null;
  source_url: string | null;
}

interface ProvisionHistory {
  document_id: string;
  provision_ref: string;
  current_version: string | null;
  versions: ProvisionVersion[];
}

interface ProvisionDiff {
  document_id: string;
  provision_ref: string;
  from_date: string;
  to_date: string;
  diff: string | null;
  change_summary: string | null;
}

interface RecentChange {
  document_id: string;
  provision_ref: string;
  effective_date: string;
  change_summary: string | null;
  source_url: string | null;
}

// --- Premium gate ---

function isPremiumEnabled(): boolean {
  return process.env.PREMIUM_ENABLED === 'true';
}

function hasVersionsTable(db: InstanceType<typeof Database>): boolean {
  try {
    const row = db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='provision_versions'")
      .get() as { ok?: number } | undefined;
    return Boolean(row?.ok);
  } catch {
    return false;
  }
}

// --- Handlers ---

export async function getProvisionHistory(
  db: InstanceType<typeof Database>,
  input: GetProvisionHistoryInput,
): Promise<ProvisionHistory | { premium: false; message: string }> {
  if (!isPremiumEnabled()) {
    return { premium: false, message: PREMIUM_UPGRADE_MESSAGE };
  }

  if (!hasVersionsTable(db)) {
    throw new Error('Version tracking data not available in this database build.');
  }

  const { document_id, provision_ref } = input;

  const provisionRow = db
    .prepare('SELECT id FROM legal_provisions WHERE document_id = ? AND provision_ref = ?')
    .get(document_id, provision_ref) as { id: number } | undefined;

  if (!provisionRow) {
    throw new Error(`Provision ${provision_ref} not found in ${document_id}`);
  }

  const versions = db
    .prepare(
      `SELECT effective_date, superseded_date, change_summary, source_url
       FROM provision_versions
       WHERE provision_id = ?
       ORDER BY effective_date ASC`,
    )
    .all(provisionRow.id) as ProvisionVersion[];

  const currentVersion = versions.length > 0 ? versions[versions.length - 1].effective_date : null;

  return {
    document_id,
    provision_ref,
    current_version: currentVersion,
    versions,
  };
}

export async function diffProvision(
  db: InstanceType<typeof Database>,
  input: DiffProvisionInput,
): Promise<ProvisionDiff | { premium: false; message: string }> {
  if (!isPremiumEnabled()) {
    return { premium: false, message: PREMIUM_UPGRADE_MESSAGE };
  }

  if (!hasVersionsTable(db)) {
    throw new Error('Version tracking data not available in this database build.');
  }

  const { document_id, provision_ref, from_date, to_date } = input;
  const effectiveToDate = to_date ?? new Date().toISOString().slice(0, 10);

  const provisionRow = db
    .prepare('SELECT id FROM legal_provisions WHERE document_id = ? AND provision_ref = ?')
    .get(document_id, provision_ref) as { id: number } | undefined;

  if (!provisionRow) {
    throw new Error(`Provision ${provision_ref} not found in ${document_id}`);
  }

  const diffRow = db
    .prepare(
      `SELECT diff_from_previous, change_summary, effective_date
       FROM provision_versions
       WHERE provision_id = ?
         AND effective_date > ?
         AND effective_date <= ?
       ORDER BY effective_date DESC
       LIMIT 1`,
    )
    .get(provisionRow.id, from_date, effectiveToDate) as
    | {
        diff_from_previous: string | null;
        change_summary: string | null;
        effective_date: string | null;
      }
    | undefined;

  if (!diffRow) {
    return {
      document_id,
      provision_ref,
      from_date,
      to_date: effectiveToDate,
      diff: null,
      change_summary: 'No changes found in this date range.',
    };
  }

  return {
    document_id,
    provision_ref,
    from_date,
    to_date: effectiveToDate,
    diff: diffRow.diff_from_previous,
    change_summary: diffRow.change_summary,
  };
}

export async function getRecentChanges(
  db: InstanceType<typeof Database>,
  input: GetRecentChangesInput,
): Promise<
  { since: string; changes: RecentChange[]; total: number } | { premium: false; message: string }
> {
  if (!isPremiumEnabled()) {
    return { premium: false, message: PREMIUM_UPGRADE_MESSAGE };
  }

  if (!hasVersionsTable(db)) {
    throw new Error('Version tracking data not available in this database build.');
  }

  const { document_id, since, limit } = input;
  const effectiveLimit = Math.min(limit ?? 50, 200);

  let sql = `
    SELECT
      p.document_id,
      p.provision_ref,
      v.effective_date,
      v.change_summary,
      v.source_url
    FROM provision_versions v
    JOIN legal_provisions p ON p.id = v.provision_id
    WHERE v.effective_date >= ?
  `;
  const params: (string | number)[] = [since];

  if (document_id) {
    sql += ' AND p.document_id = ?';
    params.push(document_id);
  }

  sql += ' ORDER BY v.effective_date DESC LIMIT ?';
  params.push(effectiveLimit);

  const changes = db.prepare(sql).all(...params) as RecentChange[];

  return {
    since,
    changes,
    total: changes.length,
  };
}
