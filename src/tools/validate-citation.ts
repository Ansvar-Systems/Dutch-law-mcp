import type { Database } from '@ansvar/mcp-sqlite';
import { validateCitation as validate } from '../citation/validator.js';
import { formatCitation } from '../citation/formatter.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import type { ValidationResult } from '../types/citations.js';

export interface ValidateCitationInput {
  citation: string;
}

export interface ValidateCitationResult extends ValidationResult {
  formatted_citation: string;
}

export async function validateCitationTool(
  db: Database,
  input: ValidateCitationInput,
): Promise<ToolResponse<ValidateCitationResult>> {
  const validation = validate(db, input.citation);
  const formatted = formatCitation(input.citation);

  const result: ValidateCitationResult = {
    ...validation,
    formatted_citation: formatted,
  };

  return { results: result, _metadata: generateResponseMetadata(db) };
}
