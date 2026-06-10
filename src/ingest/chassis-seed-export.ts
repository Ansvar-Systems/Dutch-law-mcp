/**
 * Adapter: BWB ingest seed → canonical chassis StatuteSeed JSON.
 *
 * The fleet translator (ansvar-mcp-fleet mcps/dutch-law/scripts/
 * build-chassis-db.ts) consumes the canonical shape
 * `{ id, type, title, url, provisions: [{provision_ref, content}] }` with
 * id "nl:bwb:<digits>" — its header explicitly defers this adapter to this
 * repo. Deterministic transform only; no content is authored here.
 */

interface IngestSeed {
  documents?: Array<{ id?: string; type?: string; title?: string; url?: string }>;
  provisions?: Array<{ provision_ref?: string; content?: string }>;
}

export interface ChassisStatuteSeed {
  id: string;
  type: string;
  title: string;
  url: string;
  provisions: Array<{ provision_ref: string; content: string }>;
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

export function toChassisSeed(seed: IngestSeed): ChassisStatuteSeed {
  const doc = seed.documents?.[0];
  if (!doc?.id) {
    throw new Error('seed has no documents[0].id — refusing to emit an id-less statute');
  }
  return {
    id: chassisId(doc.id),
    type: doc.type ?? 'statute',
    title: doc.title ?? '',
    url: doc.url ?? `https://wetten.overheid.nl/${doc.id}`,
    provisions: (seed.provisions ?? [])
      .filter((p) => p.provision_ref && p.content && p.content.trim() !== '')
      .map((p) => ({ provision_ref: p.provision_ref as string, content: p.content as string })),
  };
}
