#!/usr/bin/env tsx

/**
 * DEPRECATED 2026-06-10 (Dutch-law-mcp#119): this script acquires the OLDEST
 * toestand (un-versioned URL fallback / first-occurrence dedup / pinned
 * historical dates) and writes seeds the refresh policy cannot reason about.
 * Use `npm run ingest:sweep` or scripts/ingest-single-bwb.ts instead.
 */
if (process.env.FORCE_LEGACY_INGEST !== '1') {
  console.error(
    'DEPRECATED: this script acquires the OLDEST consolidation of each statute (issue #119). ' +
      'Use `npm run ingest:sweep` or scripts/ingest-single-bwb.ts. ' +
      'Set FORCE_LEGACY_INGEST=1 only if you understand the staleness consequences.',
  );
  process.exit(2);
}
/**
 * Direct fetcher for key Dutch statutes by BWB-ID.
 *
 * Bypasses the SRU discovery step and fetches specific important statutes
 * directly from the repository. Uses known BWB-IDs and tries to find the
 * latest toestand version via redirect.
 *
 * Usage: npx tsx scripts/fetch-key-statutes.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBwbXml } from '../src/parsers/bwb-xml-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.resolve(__dirname, '..', 'data', 'seed');

const RATE_LIMIT_MS = 1500;

/**
 * Key Dutch statutes to fetch. Each entry has:
 * - bwbId: the BWB identifier
 * - title: human-readable name
 * - date: a known valid toestand date (used to construct the URL)
 */
const KEY_STATUTES: Array<{ bwbId: string; title: string; dates: string[] }> = [
  // Core civil law
  {
    bwbId: 'BWBR0002656',
    title: 'Grondwet',
    dates: ['2023-02-22_0', '2022-08-25_0', '2018-02-17_0'],
  },
  {
    bwbId: 'BWBR0005289',
    title: 'Burgerlijk Wetboek Boek 1',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0003045',
    title: 'Burgerlijk Wetboek Boek 2',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0005291',
    title: 'Burgerlijk Wetboek Boek 3',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0005290',
    title: 'Burgerlijk Wetboek Boek 4',
    dates: ['2023-01-01_0', '2022-01-01_0', '2018-01-01_0'],
  },
  {
    bwbId: 'BWBR0005288',
    title: 'Burgerlijk Wetboek Boek 5',
    dates: ['2023-01-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0005289',
    title: 'Burgerlijk Wetboek Boek 6',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0005290',
    title: 'Burgerlijk Wetboek Boek 7',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  // Criminal law
  {
    bwbId: 'BWBR0001854',
    title: 'Wetboek van Strafrecht',
    dates: ['2023-07-01_0', '2022-01-01_0', '2002-04-01_0'],
  },
  {
    bwbId: 'BWBR0001903',
    title: 'Wetboek van Strafvordering',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  // Administrative law
  {
    bwbId: 'BWBR0005537',
    title: 'Algemene wet bestuursrecht',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  // Other important laws
  {
    bwbId: 'BWBR0003245',
    title: 'Faillissementswet',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0002320',
    title: 'Gemeentewet',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0005416',
    title: 'Provinciewet',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0001840',
    title: 'Wet op de rechterlijke organisatie',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0001830',
    title: 'Wetboek van Koophandel',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0002226',
    title: 'Auteurswet',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0011353',
    title: 'Arbeidsomstandighedenwet',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0006502',
    title: 'Wet op de identificatieplicht',
    dates: ['2023-01-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0011468',
    title: 'Vreemdelingenwet 2000',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0012018',
    title: 'Wet arbeid en zorg',
    dates: ['2023-08-02_0', '2022-08-02_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0009405',
    title: 'Mededingingswet',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0003738',
    title: 'Wet op het financieel toezicht',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0002629',
    title: 'Algemene Ouderdomswet',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0001860',
    title: 'Wet op de economische delicten',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  { bwbId: 'BWBR0044747', title: 'Omgevingswet', dates: ['2024-01-01_0', '2023-07-01_0'] },
  {
    bwbId: 'BWBR0020368',
    title: 'Wet maatschappelijke ondersteuning 2015',
    dates: ['2023-07-01_0', '2022-01-01_0'],
  },
  {
    bwbId: 'BWBR0035917',
    title: 'Jeugdwet',
    dates: ['2023-07-01_0', '2022-01-01_0', '2020-01-01_0'],
  },
  {
    bwbId: 'BWBR0015703',
    title: 'Wet werk en bijstand',
    dates: ['2023-01-01_0', '2022-01-01_0', '2015-01-01_0'],
  },
  {
    bwbId: 'BWBR0005290',
    title: 'Burgerlijk Wetboek Boek 8',
    dates: ['2023-07-01_0', '2022-01-01_0'],
  },
];

const REPO_BASE = 'https://repository.officiele-overheidspublicaties.nl/bwb';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeSeedFile(
  bwbId: string,
  title: string,
  provisions: Array<{
    provision_ref: string;
    book?: string;
    chapter?: string;
    section?: string;
    article: string;
    title?: string;
    content: string;
  }>,
): void {
  const seedData = {
    documents: [
      {
        id: bwbId,
        type: 'statute' as const,
        title,
        status: 'in_force',
        url: `https://wetten.overheid.nl/${bwbId}`,
      },
    ],
    provisions: provisions.map((p) => ({
      document_id: bwbId,
      provision_ref: p.provision_ref,
      book: p.book,
      chapter: p.chapter,
      section: p.section,
      article: p.article,
      title: p.title,
      content: p.content,
    })),
  };

  const filePath = path.join(SEED_DIR, `${bwbId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(seedData, null, 2), 'utf-8');
}

async function fetchStatute(
  bwbId: string,
  dates: string[],
): Promise<{
  title: string;
  provisions: Array<{
    provision_ref: string;
    book?: string;
    chapter?: string;
    section?: string;
    article: string;
    title?: string;
    content: string;
  }>;
} | null> {
  for (const date of dates) {
    const xmlUrl = `${REPO_BASE}/${bwbId}/${date}/xml/${bwbId}_${date}.xml`;
    try {
      const response = await fetch(xmlUrl, { redirect: 'follow' });
      if (!response.ok) continue;

      const xml = await response.text();
      if (!xml || xml.length < 100) continue;

      const parsed = parseBwbXml(xml);
      if (parsed.provisions.length > 0) {
        return { title: parsed.title, provisions: parsed.provisions };
      }
    } catch {
      continue;
    }
    await sleep(500);
  }
  return null;
}

async function main(): Promise<void> {
  console.log('=== Fetching Key Dutch Statutes ===');
  console.log();

  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  // Deduplicate by BWB-ID (some entries are repeated for different books of the same code)
  const seen = new Set<string>();
  const uniqueStatutes = KEY_STATUTES.filter((s) => {
    if (seen.has(s.bwbId)) return false;
    seen.add(s.bwbId);
    return true;
  });

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < uniqueStatutes.length; i++) {
    const statute = uniqueStatutes[i];
    const seedPath = path.join(SEED_DIR, `${statute.bwbId}.json`);

    if (fs.existsSync(seedPath)) {
      console.log(
        `  [${i + 1}/${uniqueStatutes.length}] ${statute.bwbId} (${statute.title}) — already exists, skipping`,
      );
      skipCount++;
      continue;
    }

    console.log(
      `  [${i + 1}/${uniqueStatutes.length}] ${statute.bwbId} (${statute.title}) — fetching...`,
    );

    const result = await fetchStatute(statute.bwbId, statute.dates);

    if (result && result.provisions.length > 0) {
      writeSeedFile(statute.bwbId, result.title || statute.title, result.provisions);
      console.log(`    Parsed ${result.provisions.length} provisions`);
      successCount++;
    } else {
      console.log(`    No provisions found`);
      errorCount++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log();
  console.log('=== Key Statutes Fetch Complete ===');
  console.log(`  Fetched: ${successCount}`);
  console.log(`  Skipped: ${skipCount}`);
  console.log(`  Failed:  ${errorCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
