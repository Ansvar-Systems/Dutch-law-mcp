/**
 * Shared seed builder (PR #117 review fix).
 *
 * Three scripts used to write seeds with three different shapes/stampings:
 * ingest-bwb stamped {retrieved_at, sru_modified}, the backfill stamped with
 * sruModified always null, and the single-id ingest did not stamp at all —
 * leaving the refresh policy unable to reason about parts of the corpus.
 * One builder, one shape, always stamped (including the toestand identity).
 */

import { stampIngestMeta } from './refresh-policy.js';

export interface SeedProvisionInput {
  provision_ref: string;
  book?: string;
  chapter?: string;
  section?: string;
  article?: string;
  title?: string;
  content: string;
}

export function buildSeed(opts: {
  bwbId: string;
  title: string;
  provisions: SeedProvisionInput[];
  in_force_date?: string;
  sruModified: string | null;
  toestand: string | null;
  now: string;
}): {
  documents: Array<Record<string, unknown>>;
  provisions: Array<Record<string, unknown>>;
  _ingest: { retrieved_at: string; sru_modified: string | null; toestand: string | null };
} {
  return stampIngestMeta(
    {
      documents: [
        {
          id: opts.bwbId,
          type: 'statute' as const,
          title: opts.title,
          status: 'in_force',
          ...(opts.in_force_date ? { in_force_date: opts.in_force_date } : {}),
          url: `https://wetten.overheid.nl/${opts.bwbId}`,
        },
      ],
      provisions: opts.provisions.map((p) => ({
        document_id: opts.bwbId,
        provision_ref: p.provision_ref,
        book: p.book,
        chapter: p.chapter,
        section: p.section,
        article: p.article,
        title: p.title,
        content: p.content,
      })),
    },
    { sruModified: opts.sruModified, toestand: opts.toestand, now: opts.now },
  );
}
