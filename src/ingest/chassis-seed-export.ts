/**
 * Adapter: BWB ingest seed → canonical chassis StatuteSeed JSON.
 *
 * The fleet translator (ansvar-mcp-fleet mcps/dutch-law/scripts/
 * build-chassis-db.ts) consumes the canonical shape
 * `{ id, type, title, status?, url, provisions: [{provision_ref, title?,
 * content}] }` — its header explicitly defers this adapter to this repo.
 * Provision titles feed the translator's content_fts title column
 * (heading-only concept recall) and the document status feeds the mcp-base
 * repealed-demotion ranking; both MUST be forwarded when the seed carries
 * them. Deterministic transform only; no content is authored here.
 */

interface IngestSeed {
  documents?: Array<{ id?: string; type?: string; title?: string; status?: string; url?: string }>;
  provisions?: Array<{ provision_ref?: string; title?: string; content?: string }>;
}

export interface ChassisStatuteSeed {
  id: string;
  type: string;
  title: string;
  status?: string;
  url: string;
  provisions: Array<{ provision_ref: string; title?: string; content: string }>;
}

function chassisId(bwbId: string): string {
  if (!/^BWB[RV]\d+$/.test(bwbId)) throw new Error(`unrecognised BWB id: ${bwbId}`);
  // PROD-STABLE convention: the deployed dutch chassis serves canonical_refs of
  // the form "nl:BWBR0001821:<ref>" (verified 2026-06-10 against the live DB).
  // The fleet translator header documents "nl:bwb:0040940" but that form never
  // shipped — changing it would break every previously issued citation, and
  // canonical_ref IS citation identity. Keep the raw BWB id.
  return `nl:${bwbId}`;
}

function isExportable(p: { provision_ref?: string; content?: string }): boolean {
  return Boolean(p.provision_ref && p.content && p.content.trim() !== '');
}

/**
 * Provision refs the export filter drops (empty/whitespace content or missing
 * ref). Callers MUST surface these — a dropped provision is a coverage
 * regression a corpus swap has to be able to audit.
 */
export function droppedProvisionRefs(seed: IngestSeed): string[] {
  return (seed.provisions ?? [])
    .filter((p) => !isExportable(p))
    .map((p) => p.provision_ref ?? '(no ref)');
}

export function toChassisSeed(seed: IngestSeed): ChassisStatuteSeed {
  const doc = seed.documents?.[0];
  if (!doc?.id) {
    throw new Error('seed has no documents[0].id — refusing to emit an id-less statute');
  }
  return {
    id: chassisId(doc.id),
    type: doc.type ?? 'statute',
    title: doc.title ?? '',
    ...(doc.status ? { status: doc.status } : {}),
    url: doc.url ?? `https://wetten.overheid.nl/${doc.id}`,
    provisions: (seed.provisions ?? []).filter(isExportable).map((p) => ({
      provision_ref: p.provision_ref as string,
      ...(p.title ? { title: p.title } : {}),
      content: p.content as string,
    })),
  };
}
