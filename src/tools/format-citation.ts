import { formatCitation } from '../citation/formatter.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import type { CitationFormat } from '../types/citations.js';

export interface FormatCitationInput {
  citation: string;
  format?: CitationFormat;
}

export interface FormatCitationResult {
  original: string;
  formatted: string;
  format_used: CitationFormat;
}

export async function formatCitationTool(
  input: FormatCitationInput,
): Promise<ToolResponse<FormatCitationResult>> {
  const format = input.format ?? 'full';
  const formatted = formatCitation(input.citation, format);

  const result: FormatCitationResult = {
    original: input.citation,
    formatted,
    format_used: format,
  };

  return { results: result, _metadata: generateResponseMetadata() };
}
