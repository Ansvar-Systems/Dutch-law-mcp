import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getDutchImplementations } from '../../src/tools/get-dutch-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';

describe('EU Cross-Reference Tools', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = createTestDatabase();
  });
  afterAll(() => {
    closeTestDatabase(db);
  });

  // -------------------------------------------------------------------------
  // getEUBasis
  // -------------------------------------------------------------------------
  describe('getEUBasis', () => {
    it('should return results and metadata', async () => {
      const result = await getEUBasis(db, { document_id: 'BWBR0042124' });
      expect(result.results).toBeDefined();
      expect(result._metadata).toBeDefined();
      expect(result._metadata.disclaimer).toContain('NOT LEGAL ADVICE');
    });

    it('should find EU basis for UAVG (BWBR0042124)', async () => {
      const result = await getEUBasis(db, { document_id: 'BWBR0042124' });
      expect(result.results.document_id).toBe('BWBR0042124');
      expect(result.results.document_title).toContain('Uitvoeringswet');
      expect(result.results.eu_documents.length).toBeGreaterThan(0);

      const gdpr = result.results.eu_documents.find((d) => d.id === 'regulation:2016/679');
      expect(gdpr).toBeDefined();
      expect(gdpr!.type).toBe('regulation');
      expect(gdpr!.year).toBe(2016);
      expect(gdpr!.number).toBe(679);
      expect(gdpr!.is_primary_implementation).toBe(true);
    });

    it('should return statistics', async () => {
      const result = await getEUBasis(db, { document_id: 'BWBR0042124' });
      expect(result.results.statistics.total_eu_references).toBeGreaterThan(0);
      expect(result.results.statistics.regulation_count).toBeGreaterThanOrEqual(1);
    });

    it('should include articles when requested', async () => {
      const result = await getEUBasis(db, {
        document_id: 'BWBR0042124',
        include_articles: true,
      });
      const gdpr = result.results.eu_documents.find((d) => d.id === 'regulation:2016/679');
      expect(gdpr).toBeDefined();
      expect(gdpr!.articles).toBeDefined();
      expect(gdpr!.articles!).toContain('51');
    });

    it('should filter by reference_types', async () => {
      const result = await getEUBasis(db, {
        document_id: 'BWBR0042124',
        reference_types: ['supplements'],
      });
      expect(result.results.eu_documents.length).toBeGreaterThan(0);
      for (const doc of result.results.eu_documents) {
        expect(doc.reference_type).toBe('supplements');
      }
    });

    it('should return empty eu_documents for document without EU basis', async () => {
      const result = await getEUBasis(db, { document_id: 'BWBR0001854' });
      expect(result.results.eu_documents).toHaveLength(0);
      expect(result.results.statistics.total_eu_references).toBe(0);
    });

    it('should find EU basis for Wbp (directive:95/46)', async () => {
      const result = await getEUBasis(db, { document_id: 'BWBR0011823' });
      expect(result.results.eu_documents.length).toBeGreaterThan(0);
      const directive = result.results.eu_documents.find((d) => d.id === 'directive:95/46');
      expect(directive).toBeDefined();
      expect(directive!.type).toBe('directive');
      expect(directive!.reference_type).toBe('implements');
    });
  });

  // -------------------------------------------------------------------------
  // getDutchImplementations
  // -------------------------------------------------------------------------
  describe('getDutchImplementations', () => {
    it('should return results and metadata', async () => {
      const result = await getDutchImplementations(db, { eu_document_id: 'regulation:2016/679' });
      expect(result.results).toBeDefined();
      expect(result._metadata).toBeDefined();
    });

    it('should find Dutch implementations of GDPR', async () => {
      const result = await getDutchImplementations(db, { eu_document_id: 'regulation:2016/679' });
      expect(result.results.eu_document.id).toBe('regulation:2016/679');
      expect(result.results.eu_document.type).toBe('regulation');
      expect(result.results.eu_document.year).toBe(2016);
      expect(result.results.implementations.length).toBeGreaterThan(0);

      const uavg = result.results.implementations.find((i) => i.bwb_id === 'BWBR0042124');
      expect(uavg).toBeDefined();
      expect(uavg!.title).toContain('Uitvoeringswet');
      expect(uavg!.is_primary_implementation).toBe(true);
    });

    it('should return implementation statistics', async () => {
      const result = await getDutchImplementations(db, { eu_document_id: 'regulation:2016/679' });
      expect(result.results.statistics.total_statutes).toBeGreaterThan(0);
      expect(result.results.statistics.primary_implementations).toBeGreaterThanOrEqual(1);
      expect(result.results.statistics.in_force).toBeGreaterThanOrEqual(1);
    });

    it('should filter primary_only', async () => {
      const result = await getDutchImplementations(db, {
        eu_document_id: 'regulation:2016/679',
        primary_only: true,
      });
      for (const impl of result.results.implementations) {
        expect(impl.is_primary_implementation).toBe(true);
      }
    });

    it('should filter in_force_only', async () => {
      const result = await getDutchImplementations(db, {
        eu_document_id: 'directive:95/46',
        in_force_only: true,
      });
      // Wbp is repealed, so should not appear with in_force_only
      const wbp = result.results.implementations.find((i) => i.bwb_id === 'BWBR0011823');
      expect(wbp).toBeUndefined();
    });

    it('should find Wbp as implementation of directive:95/46', async () => {
      const result = await getDutchImplementations(db, { eu_document_id: 'directive:95/46' });
      const wbp = result.results.implementations.find((i) => i.bwb_id === 'BWBR0011823');
      expect(wbp).toBeDefined();
      expect(wbp!.reference_type).toBe('implements');
      expect(wbp!.status).toBe('repealed');
      expect(result.results.statistics.repealed).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for unknown EU document', async () => {
      const result = await getDutchImplementations(db, { eu_document_id: 'directive:9999/999' });
      expect(result.results.implementations).toHaveLength(0);
      expect(result.results.statistics.total_statutes).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // searchEUImplementations
  // -------------------------------------------------------------------------
  describe('searchEUImplementations', () => {
    it('should return results and metadata', async () => {
      const result = await searchEUImplementations(db, {});
      expect(result.results).toBeDefined();
      expect(result._metadata).toBeDefined();
    });

    it('should return all EU documents without filters', async () => {
      const result = await searchEUImplementations(db, {});
      expect(result.results.documents.length).toBe(2);
      expect(result.results.total_count).toBe(2);
    });

    it('should search by query (title_nl)', async () => {
      const result = await searchEUImplementations(db, { query: 'bescherming' });
      expect(result.results.documents.length).toBeGreaterThan(0);
      // Both EU documents mention "bescherming" in title_nl
    });

    it('should search by short_name', async () => {
      const result = await searchEUImplementations(db, { query: 'AVG' });
      expect(result.results.documents.length).toBeGreaterThan(0);
      const avg = result.results.documents.find((d) => d.short_name === 'AVG');
      expect(avg).toBeDefined();
    });

    it('should filter by type', async () => {
      const result = await searchEUImplementations(db, { type: 'regulation' });
      expect(result.results.documents.length).toBe(1);
      expect(result.results.documents[0].type).toBe('regulation');
    });

    it('should filter by community', async () => {
      const result = await searchEUImplementations(db, { community: 'EG' });
      expect(result.results.documents.length).toBe(1);
      expect(result.results.documents[0].id).toBe('directive:95/46');
    });

    it('should filter by year range', async () => {
      const result = await searchEUImplementations(db, { year_from: 2000, year_to: 2020 });
      expect(result.results.documents.length).toBe(1);
      expect(result.results.documents[0].year).toBe(2016);
    });

    it('should filter has_dutch_implementation=true', async () => {
      const result = await searchEUImplementations(db, { has_dutch_implementation: true });
      for (const doc of result.results.documents) {
        expect(doc.has_dutch_implementation).toBe(true);
        expect(doc.dutch_statute_count).toBeGreaterThan(0);
      }
    });

    it('should return dutch_statute_count', async () => {
      const result = await searchEUImplementations(db, {});
      const gdpr = result.results.documents.find((d) => d.id === 'regulation:2016/679');
      expect(gdpr).toBeDefined();
      expect(gdpr!.dutch_statute_count).toBeGreaterThan(0);
    });

    it('should respect limit', async () => {
      const result = await searchEUImplementations(db, { limit: 1 });
      expect(result.results.documents.length).toBeLessThanOrEqual(1);
    });

    it('should convert in_force to boolean', async () => {
      const result = await searchEUImplementations(db, {});
      const gdpr = result.results.documents.find((d) => d.id === 'regulation:2016/679');
      expect(gdpr!.in_force).toBe(true);
      const directive = result.results.documents.find((d) => d.id === 'directive:95/46');
      expect(directive!.in_force).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getProvisionEUBasis
  // -------------------------------------------------------------------------
  describe('getProvisionEUBasis', () => {
    it('should return results and metadata', async () => {
      const result = await getProvisionEUBasis(db, {
        document_id: 'BWBR0042124',
        provision_ref: '30',
      });
      expect(result.results).toBeDefined();
      expect(result._metadata).toBeDefined();
    });

    it('should find EU basis for UAVG article 30', async () => {
      const result = await getProvisionEUBasis(db, {
        document_id: 'BWBR0042124',
        provision_ref: '30',
      });
      expect(result.results.document_id).toBe('BWBR0042124');
      expect(result.results.provision_ref).toBe('30');
      expect(result.results.provision_title).toBe('Autoriteit Persoonsgegevens');
      expect(result.results.eu_references.length).toBeGreaterThan(0);

      const ref = result.results.eu_references[0];
      expect(ref.id).toBe('regulation:2016/679');
      expect(ref.article).toBe('51');
      expect(ref.reference_type).toBe('cites_article');
    });

    it('should return statistics', async () => {
      const result = await getProvisionEUBasis(db, {
        document_id: 'BWBR0042124',
        provision_ref: '30',
      });
      expect(result.results.statistics.total_references).toBeGreaterThan(0);
      expect(result.results.statistics.regulation_count).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for provision without EU references', async () => {
      const result = await getProvisionEUBasis(db, {
        document_id: 'BWBR0042124',
        provision_ref: '1',
      });
      expect(result.results.eu_references).toHaveLength(0);
      expect(result.results.statistics.total_references).toBe(0);
    });

    it('should return empty for non-existent provision', async () => {
      const result = await getProvisionEUBasis(db, {
        document_id: 'BWBR0042124',
        provision_ref: '999',
      });
      expect(result.results.eu_references).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // validateEUCompliance
  // -------------------------------------------------------------------------
  describe('validateEUCompliance', () => {
    it('should return results and metadata', async () => {
      const result = await validateEUCompliance(db, { document_id: 'BWBR0042124' });
      expect(result.results).toBeDefined();
      expect(result._metadata).toBeDefined();
    });

    it('should validate UAVG compliance with GDPR', async () => {
      const result = await validateEUCompliance(db, { document_id: 'BWBR0042124' });
      expect(result.results.document_id).toBe('BWBR0042124');
      expect(result.results.eu_references_checked).toBeGreaterThan(0);
      // GDPR is in force, UAVG implementation is complete => compliant
      expect(result.results.compliance_status).toBe('compliant');
    });

    it('should detect issues for Wbp referencing repealed directive', async () => {
      const result = await validateEUCompliance(db, { document_id: 'BWBR0011823' });
      expect(result.results.issues.length).toBeGreaterThan(0);
      const repealedIssue = result.results.issues.find((i) => i.type === 'repealed_eu_document');
      expect(repealedIssue).toBeDefined();
      expect(repealedIssue!.severity).toBe('high');
      expect(repealedIssue!.eu_document_id).toBe('directive:95/46');
    });

    it('should return non_compliant for high severity issues', async () => {
      const result = await validateEUCompliance(db, { document_id: 'BWBR0011823' });
      expect(result.results.compliance_status).toBe('non_compliant');
      expect(result.results.statistics.high_severity).toBeGreaterThan(0);
    });

    it('should filter by eu_document_id', async () => {
      const result = await validateEUCompliance(db, {
        document_id: 'BWBR0042124',
        eu_document_id: 'regulation:2016/679',
      });
      expect(result.results.eu_references_checked).toBeGreaterThan(0);
    });

    it('should return unknown for document without EU references', async () => {
      const result = await validateEUCompliance(db, { document_id: 'BWBR0001854' });
      expect(result.results.compliance_status).toBe('unknown');
      expect(result.results.eu_references_checked).toBe(0);
    });

    it('should return statistics', async () => {
      const result = await validateEUCompliance(db, { document_id: 'BWBR0011823' });
      expect(result.results.statistics.total_issues).toBeGreaterThan(0);
      expect(typeof result.results.statistics.high_severity).toBe('number');
      expect(typeof result.results.statistics.medium_severity).toBe('number');
      expect(typeof result.results.statistics.low_severity).toBe('number');
    });
  });
});
