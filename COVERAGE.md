# Coverage Index -- Netherlands Law MCP

> Auto-generated from database census. Do not edit manually.
> Generated: 2026-03-24

## Source

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| Authority   | Dutch Government (Overheid.nl)                   |
| Portal      | [wetten.overheid.nl](https://wetten.overheid.nl) |
| License     | Government Open Data (CC0)                       |
| Census date | 2026-03-24                                       |

## Summary

| Metric                | Count      |
| --------------------- | ---------- |
| Total laws enumerated | 3,251      |
| Ingestable            | 3,251      |
| Ingested              | 3,251      |
| Excluded              | 0          |
| Provisions extracted  | 77,531     |
| Provision versions    | 78,691     |
| Definitions extracted | 1,890      |
| Cross-references      | 6,326      |
| EU documents linked   | 17         |
| EU references         | 23         |
| **Coverage**          | **100.0%** |

## Ingestion Pipeline

All 3,251 statutes from the BWB (Basiswettenbestand) corpus ingested via SRU discovery at
`zoekservice.overheid.nl` with parallel XML fetch. Enrichment pipeline populates definitions,
cross-references, and EU document linkages from provision content.

| Step                             | Script                                          | Output              |
| -------------------------------- | ----------------------------------------------- | ------------------- |
| 1. Statute discovery + XML fetch | `ingest-bwb.ts` / `auto-ingest-all-statutes.ts` | 3,251 seed files    |
| 2. Definition extraction         | `extract-definitions.ts`                        | 1,890 definitions   |
| 3. EUR-Lex reference scan        | `import-eurlex-documents.ts`                    | 17 EU docs, 23 refs |
| 4. Database build                | `build-db.ts`                                   | 126 MB SQLite       |
| 5. Cross-reference population    | `populate-cross-references.ts`                  | 6,326 cross-refs    |

## Premium Tier

| Metric                           | Count   |
| -------------------------------- | ------- |
| Case law (rechtspraak.nl)        | 59,261  |
| Case law with full text          | 47,996  |
| Preparatory works (Tweede Kamer) | 2,994   |
| Agency guidance (ParlaMint-NL)   | 596,180 |
| Premium DB size                  | 1.3 GB  |

## Top 20 Laws by Provision Count

| Title                                   | BWB-ID      | Status   | Provisions |
| --------------------------------------- | ----------- | -------- | ---------- |
| Wetboek van Burgerlijke Rechtsvordering | BWBR0001827 | in_force | 1,330      |
| Wetboek van Koophandel                  | BWBR0001838 | in_force | 1,307      |
| Wetboek van Strafvordering              | BWBR0001903 | in_force | 897        |
| Wet financieel toezicht                 | BWBR0020368 | in_force | 734        |
| Burgerlijk Wetboek Boek 8               | BWBR0005034 | in_force | 702        |
| Wetboek van Strafrecht                  | BWBR0001854 | in_force | 674        |
| Omgevingswet                            | BWBR0037885 | in_force | 666        |
| Burgerlijk Wetboek Boek 1               | BWBR0002656 | in_force | 595        |
| Burgerlijk Wetboek Boek 2               | BWBR0003045 | in_force | 566        |
| Wet op het hoger onderwijs              | BWBR0044212 | in_force | 492        |
| Wet educatie en beroepsonderwijs        | BWBR0005682 | in_force | 423        |
| Faillissementswet                       | BWBR0001860 | in_force | 413        |
| Wet op de kansspelen                    | BWBR0003245 | in_force | 393        |
| Algemene wet bestuursrecht              | BWBR0005537 | in_force | 380        |
| Wet op het voortgezet onderwijs         | BWBR0004627 | in_force | 370        |
| Wet op de rechterlijke organisatie      | BWBR0005416 | in_force | 366        |
| Wet op het basisonderwijs               | BWBR0004149 | in_force | 344        |
| Wet op het primair onderwijs            | BWBR0005645 | in_force | 335        |
| Burgerlijk Wetboek Boek 7A              | BWBR0006000 | in_force | 331        |
| Wet inkomstenbelasting 2001             | BWBR0011353 | in_force | 330        |
