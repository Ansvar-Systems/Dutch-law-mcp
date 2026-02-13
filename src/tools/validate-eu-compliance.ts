import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ValidateEUComplianceInput {
  document_id: string;
  provision_ref?: string;
  eu_document_id?: string;
}

export interface ComplianceIssue {
  type: 'missing_implementation' | 'partial_implementation' | 'outdated_reference' | 'repealed_eu_document';
  severity: 'high' | 'medium' | 'low';
  description: string;
  eu_document_id?: string;
  recommendation: string;
}

export interface ValidateEUComplianceResult {
  document_id: string;
  provision_ref?: string;
  compliance_status: 'compliant' | 'partially_compliant' | 'non_compliant' | 'unknown';
  issues: ComplianceIssue[];
  eu_references_checked: number;
  statistics: {
    total_issues: number;
    high_severity: number;
    medium_severity: number;
    low_severity: number;
  };
}

interface ReferenceRow {
  eu_document_id: string;
  reference_type: string;
  is_primary_implementation: number;
  implementation_status: string | null;
  eu_article: string | null;
  provision_id: number | null;
}

interface EUDocStatusRow {
  id: string;
  type: string;
  in_force: number;
  title: string | null;
  short_name: string | null;
  amended_by: string | null;
}

export async function validateEUCompliance(
  db: Database,
  input: ValidateEUComplianceInput,
): Promise<ToolResponse<ValidateEUComplianceResult>> {
  const { document_id, provision_ref, eu_document_id } = input;

  const issues: ComplianceIssue[] = [];

  // Build query for EU references
  const conditions: string[] = ['er.document_id = ?'];
  const params: (string | number)[] = [document_id];

  if (provision_ref) {
    const provRow = db.prepare(
      `SELECT id FROM legal_provisions WHERE document_id = ? AND provision_ref = ?`,
    ).get(document_id, provision_ref) as { id: number } | undefined;
    if (provRow) {
      conditions.push('er.provision_id = ?');
      params.push(provRow.id);
    }
  }

  if (eu_document_id) {
    conditions.push('er.eu_document_id = ?');
    params.push(eu_document_id);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const sql = `
    SELECT
      er.eu_document_id,
      er.reference_type,
      er.is_primary_implementation,
      er.implementation_status,
      er.eu_article,
      er.provision_id
    FROM eu_references AS er
    ${whereClause}
  `;

  const references = db.prepare(sql).all(...params) as ReferenceRow[];

  // Check each referenced EU document
  const checkedEuDocs = new Set<string>();
  for (const ref of references) {
    checkedEuDocs.add(ref.eu_document_id);

    const euDoc = db.prepare(
      `SELECT id, type, in_force, title, short_name, amended_by FROM eu_documents WHERE id = ?`,
    ).get(ref.eu_document_id) as EUDocStatusRow | undefined;

    if (!euDoc) continue;

    const docLabel = euDoc.short_name ?? euDoc.title ?? euDoc.id;

    // Check for partial implementation
    if (ref.implementation_status === 'partial') {
      issues.push({
        type: 'partial_implementation',
        severity: 'medium',
        description: `De implementatie van ${docLabel} is slechts gedeeltelijk.`,
        eu_document_id: euDoc.id,
        recommendation: 'Controleer of alle vereiste bepalingen van het EU-document zijn omgezet in nationale wetgeving.',
      });
    }

    // Check for pending implementation
    if (ref.implementation_status === 'pending') {
      issues.push({
        type: 'missing_implementation',
        severity: 'high',
        description: `De implementatie van ${docLabel} is nog in afwachting.`,
        eu_document_id: euDoc.id,
        recommendation: 'Zorg voor tijdige omzetting van de EU-vereisten in nationale wetgeving.',
      });
    }

    // Check if EU document is no longer in force
    if (euDoc.in_force === 0) {
      issues.push({
        type: 'repealed_eu_document',
        severity: 'high',
        description: `${docLabel} is niet meer van kracht.`,
        eu_document_id: euDoc.id,
        recommendation: euDoc.amended_by
          ? `Controleer of de verwijzing is bijgewerkt naar de opvolgende EU-wetgeving: ${euDoc.amended_by}.`
          : 'Controleer of de verwijzing naar dit EU-document nog actueel is.',
      });
    }

    // Check if EU document has been amended
    if (euDoc.amended_by && euDoc.in_force === 1) {
      issues.push({
        type: 'outdated_reference',
        severity: 'low',
        description: `${docLabel} is gewijzigd door ${euDoc.amended_by}.`,
        eu_document_id: euDoc.id,
        recommendation: 'Controleer of de nationale wetgeving de wijzigingen in het EU-document weerspiegelt.',
      });
    }
  }

  const high_severity = issues.filter(i => i.severity === 'high').length;
  const medium_severity = issues.filter(i => i.severity === 'medium').length;
  const low_severity = issues.filter(i => i.severity === 'low').length;

  let compliance_status: ValidateEUComplianceResult['compliance_status'];
  if (references.length === 0) {
    compliance_status = 'unknown';
  } else if (high_severity > 0) {
    compliance_status = 'non_compliant';
  } else if (medium_severity > 0) {
    compliance_status = 'partially_compliant';
  } else {
    compliance_status = 'compliant';
  }

  const result: ValidateEUComplianceResult = {
    document_id,
    provision_ref,
    compliance_status,
    issues,
    eu_references_checked: checkedEuDocs.size,
    statistics: {
      total_issues: issues.length,
      high_severity,
      medium_severity,
      low_severity,
    },
  };

  return { results: result, _metadata: generateResponseMetadata(db) };
}
