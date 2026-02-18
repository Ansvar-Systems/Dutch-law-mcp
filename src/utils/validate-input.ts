/**
 * Lightweight runtime input validation for tool arguments.
 *
 * Validates required fields and basic type checks at the tool boundary,
 * providing defense-in-depth beyond MCP SDK schema validation.
 */

export class InputValidationError extends Error {
  constructor(
    public readonly tool: string,
    public readonly issues: string[],
  ) {
    super(`Invalid input for ${tool}: ${issues.join('; ')}`);
    this.name = 'InputValidationError';
  }
}

interface FieldSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  maxLength?: number;
}

/**
 * Validate tool input arguments against field specifications.
 * Throws InputValidationError with actionable messages on failure.
 */
export function validateInput(
  tool: string,
  args: Record<string, unknown> | null | undefined,
  fields: FieldSpec[],
): void {
  const issues: string[] = [];

  if (!args || typeof args !== 'object') {
    if (fields.some((f) => f.required)) {
      throw new InputValidationError(tool, ['arguments object is required']);
    }
    return;
  }

  for (const field of fields) {
    const value = args[field.name];

    if (value === undefined || value === null) {
      if (field.required) {
        issues.push(`missing required parameter "${field.name}"`);
      }
      continue;
    }

    if (field.type === 'array') {
      if (!Array.isArray(value)) {
        issues.push(`"${field.name}" must be an array, got ${typeof value}`);
      }
    } else if (typeof value !== field.type) {
      issues.push(`"${field.name}" must be ${field.type}, got ${typeof value}`);
    }

    if (field.type === 'string' && typeof value === 'string') {
      if (field.maxLength && value.length > field.maxLength) {
        issues.push(`"${field.name}" exceeds max length ${field.maxLength} (got ${value.length})`);
      }
    }
  }

  if (issues.length > 0) {
    throw new InputValidationError(tool, issues);
  }
}

/** Common field specs for reuse across tools. */
export const COMMON_FIELDS = {
  query: (required = true): FieldSpec => ({
    name: 'query',
    type: 'string',
    required,
    maxLength: 1000,
  }),
  document_id: (required = true): FieldSpec => ({
    name: 'document_id',
    type: 'string',
    required,
    maxLength: 50,
  }),
  provision_ref: (required = true): FieldSpec => ({
    name: 'provision_ref',
    type: 'string',
    required,
    maxLength: 50,
  }),
  limit: { name: 'limit', type: 'number' as const, required: false },
  as_of_date: { name: 'as_of_date', type: 'string' as const, required: false, maxLength: 10 },
  citation: (required = true): FieldSpec => ({
    name: 'citation',
    type: 'string',
    required,
    maxLength: 500,
  }),
} as const;
