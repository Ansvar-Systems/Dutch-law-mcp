/**
 * Tool registry — shared between stdio and HTTP entry points.
 *
 * Exports the TOOLS array (tool definitions) and `registerTools()` which wires
 * up ListTools + CallTool handlers on any MCP Server instance.
 */

import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type Database from '@ansvar/mcp-sqlite';

import { searchLegislation, type SearchLegislationInput } from './search-legislation.js';
import { getProvision, type GetProvisionInput } from './get-provision.js';
import { searchCaseLaw, type SearchCaseLawInput } from './search-case-law.js';
import { getPreparatoryWorks, type GetPreparatoryWorksInput } from './get-preparatory-works.js';
import { validateCitationTool, type ValidateCitationInput } from './validate-citation.js';
import { buildLegalStance, type BuildLegalStanceInput } from './build-legal-stance.js';
import { formatCitationTool, type FormatCitationInput } from './format-citation.js';
import { checkCurrency, type CheckCurrencyInput } from './check-currency.js';
import { getEUBasis, type GetEUBasisInput } from './get-eu-basis.js';
import { getDutchImplementations, type GetDutchImplementationsInput } from './get-dutch-implementations.js';
import { searchEUImplementations, type SearchEUImplementationsInput } from './search-eu-implementations.js';
import { getProvisionEUBasis, type GetProvisionEUBasisInput } from './get-provision-eu-basis.js';
import { validateEUCompliance, type ValidateEUComplianceInput } from './validate-eu-compliance.js';
import { getProvisionAtDate, type GetProvisionAtDateInput } from './get-provision-at-date.js';


const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
} as const;

function toTitle(name: string): string {
  return name
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function annotateTools(tools: Tool[]): Tool[] {
  return tools.map((tool) => ({
    ...tool,
    annotations: {
      title: tool.annotations?.title ?? toTitle(tool.name),
      readOnlyHint: tool.annotations?.readOnlyHint ?? READ_ONLY_ANNOTATIONS.readOnlyHint,
      destructiveHint: tool.annotations?.destructiveHint ?? READ_ONLY_ANNOTATIONS.destructiveHint,
    },
  }));
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const TOOLS: Tool[] = [
  {
    name: 'search_legislation',
    description:
      'Search Dutch statutes and regulations by keyword. Searches FTS-indexed provisions from wetten.overheid.nl (BWB). Use document_id (BWB-ID like "BWBR0005289") to narrow to a specific statute. Supports temporal queries via as_of_date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search terms (Dutch or English)' },
        document_id: { type: 'string', description: 'BWB-ID to restrict search to a specific statute (e.g. "BWBR0005289")' },
        status: { type: 'string', description: 'Filter by status: in_force, repealed, amended' },
        as_of_date: { type: 'string', description: 'ISO date to query historical versions (e.g. "2020-01-01")' },
        limit: { type: 'number', description: 'Max results (1-50, default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description:
      'Retrieve a specific provision from a Dutch statute using BWB-ID and article reference. Examples: document_id="BWBR0005289", book="6", article="162" for Art. 6:162 BW (onrechtmatige daad). document_id="BWBR0001854", article="287" for Art. 287 Sr (doodslag). Can also use provision_ref directly (e.g. "6:162").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the statute (e.g. "BWBR0005289" for BW Boek 6)' },
        book: { type: 'string', description: 'Book number if applicable (e.g. "6" for BW Boek 6)' },
        article: { type: 'string', description: 'Article number (e.g. "162")' },
        provision_ref: { type: 'string', description: 'Full provision reference (e.g. "6:162" or "287")' },
        as_of_date: { type: 'string', description: 'ISO date to retrieve historical version' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'search_case_law',
    description:
      'Search Dutch court decisions from rechtspraak.nl. Supports full-text search with optional filters for court (e.g. HR, RVS, RBAMS), legal domain, procedure type, and date range. Use ecli for direct ECLI lookup (e.g. "ECLI:NL:HR:2019:376").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search terms' },
        court: { type: 'string', description: 'Court code: HR (Hoge Raad), RVS (Raad van State), RBAMS (Rechtbank Amsterdam), etc.' },
        ecli: { type: 'string', description: 'Direct ECLI lookup (e.g. "ECLI:NL:HR:2019:376")' },
        legal_domain: { type: 'string', description: 'Legal domain filter (e.g. "civiel", "straf", "bestuursrecht")' },
        procedure_type: { type: 'string', description: 'Procedure type filter (e.g. "cassatie", "hoger beroep")' },
        date_from: { type: 'string', description: 'Start date filter (ISO format)' },
        date_to: { type: 'string', description: 'End date filter (ISO format)' },
        limit: { type: 'number', description: 'Max results (1-50, default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_preparatory_works',
    description:
      'Get preparatory works (kamerstukken) for a Dutch statute. Returns related parliamentary documents such as memorie van toelichting (MvT), memorie van antwoord (MvA), nota naar aanleiding van het verslag, and other travaux preparatoires.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        statute_id: { type: 'string', description: 'BWB-ID of the statute (e.g. "BWBR0005289")' },
        document_type: { type: 'string', description: 'Filter by type: MvT, MvA, amendement, nota, etc.' },
        limit: { type: 'number', description: 'Max results (1-50, default 20)' },
      },
      required: ['statute_id'],
    },
  },
  {
    name: 'validate_citation',
    description:
      'Validate a Dutch legal citation and check whether the referenced document and provision exist in the database. Supported formats: "Art. 6:162 BW", "art. 287 Sr", "ECLI:NL:HR:2019:376", "Kamerstukken II 2020/21, 35815, nr. 2".',
    inputSchema: {
      type: 'object' as const,
      properties: {
        citation: { type: 'string', description: 'Citation string to validate' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'build_legal_stance',
    description:
      'Build a comprehensive legal stance on a topic by combining statute provisions, case law, preparatory works (kamerstukken), and cross-references. Returns a structured research bundle for Dutch law analysis.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Legal question or topic to research' },
        document_id: { type: 'string', description: 'BWB-ID to focus on a specific statute' },
        as_of_date: { type: 'string', description: 'ISO date for temporal context' },
        limit: { type: 'number', description: 'Max results per category (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_citation',
    description:
      'Format a Dutch legal citation into the standard format. Outputs proper Dutch citation format, e.g. "Art. 6:162 lid 2 Burgerlijk Wetboek Boek 6". Supports full, short, and pinpoint formats.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        citation: { type: 'string', description: 'Citation string to format' },
        format: { type: 'string', description: 'Output format: full, short, or pinpoint', enum: ['full', 'short', 'pinpoint'] },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description:
      'Check whether a Dutch statute or provision is currently in force (geldend recht). Returns the document status (in_force / repealed / not_yet_in_force), in-force date, repeal date, provision version validity, and any warnings about outdated or ingetrokken (withdrawn) legislation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the statute to check' },
        provision_ref: { type: 'string', description: 'Provision reference to check (e.g. "6:162")' },
        as_of_date: { type: 'string', description: 'ISO date to check validity at a specific point in time' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_eu_basis',
    description:
      'Get the EU legal basis for a Dutch statute. Shows which EU directives and regulations the statute implements or references. Returns CELEX numbers, EUR-Lex links, and reference types.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the Dutch statute (e.g. "BWBR0005289")' },
        include_articles: { type: 'boolean', description: 'Include referenced EU articles (default false)' },
        reference_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by reference type: implements, references, supplements, applies',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_dutch_implementations',
    description:
      'Get Dutch statutes that implement a given EU directive or regulation. Returns a list of BWB statutes with their implementation status, showing which Dutch laws transpose the EU instrument into national law.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        eu_document_id: { type: 'string', description: 'EU document ID to look up implementations for' },
        primary_only: { type: 'boolean', description: 'Only return primary implementations (default false)' },
        in_force_only: { type: 'boolean', description: 'Only return statutes that are currently in force (default false)' },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description:
      'Search EU directives and regulations with optional filters. Shows which EU instruments have been implemented in Dutch law and which ones are pending implementation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search terms for EU document titles' },
        type: { type: 'string', description: 'Filter by type: directive or regulation', enum: ['directive', 'regulation'] },
        year_from: { type: 'number', description: 'Start year filter' },
        year_to: { type: 'number', description: 'End year filter' },
        community: { type: 'string', description: 'EU community: EU, EG, EEG, Euratom', enum: ['EU', 'EG', 'EEG', 'Euratom'] },
        has_dutch_implementation: { type: 'boolean', description: 'Filter by whether a Dutch implementation exists' },
        limit: { type: 'number', description: 'Max results (1-100, default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_provision_eu_basis',
    description:
      'Get EU references for a specific provision in a Dutch statute. Shows which EU articles are referenced or implemented by a particular Dutch provision.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the Dutch statute' },
        provision_ref: { type: 'string', description: 'Provision reference (e.g. "6:162" or "287")' },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description:
      'Validate EU compliance for a Dutch statute or provision. Checks for missing, partial, or outdated implementations and returns compliance issues with severity levels and recommendations (in Dutch).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the Dutch statute to validate' },
        provision_ref: { type: 'string', description: 'Provision reference to narrow the check' },
        eu_document_id: { type: 'string', description: 'EU document ID to check compliance against' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_provision_at_date',
    description:
      'Retrieve a specific provision from a Dutch statute as it was at a given date. Uses the provision version history to return the text valid at the specified date. Supports amendment tracking.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the statute (e.g. "BWBR0005289")' },
        provision_ref: { type: 'string', description: 'Provision reference (e.g. "6:162" or "287")' },
        date: { type: 'string', description: 'ISO date to query the provision at (YYYY-MM-DD)' },
        include_amendments: { type: 'boolean', description: 'Include amendment history records (default false)' },
      },
      required: ['document_id', 'provision_ref', 'date'],
    },
  },
];

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

/**
 * Wire up ListTools + CallTool handlers on the given MCP Server.
 *
 * @param server  MCP Server instance
 * @param getDb   Lazy accessor for the database — called only when a tool
 *                actually needs it (allows the HTTP server to open the db
 *                once and share it across requests).
 */
export function registerTools(
  server: Server,
  getDb: () => InstanceType<typeof Database>,
): void {
  const toolsWithAnnotations = annotateTools(TOOLS);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolsWithAnnotations,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_legislation':
          result = await searchLegislation(getDb(), args as unknown as SearchLegislationInput);
          break;
        case 'get_provision':
          result = await getProvision(getDb(), args as unknown as GetProvisionInput);
          break;
        case 'search_case_law':
          result = await searchCaseLaw(getDb(), args as unknown as SearchCaseLawInput);
          break;
        case 'get_preparatory_works':
          result = await getPreparatoryWorks(getDb(), args as unknown as GetPreparatoryWorksInput);
          break;
        case 'validate_citation':
          result = await validateCitationTool(getDb(), args as unknown as ValidateCitationInput);
          break;
        case 'build_legal_stance':
          result = await buildLegalStance(getDb(), args as unknown as BuildLegalStanceInput);
          break;
        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;
        case 'check_currency':
          result = await checkCurrency(getDb(), args as unknown as CheckCurrencyInput);
          break;
        case 'get_eu_basis':
          result = await getEUBasis(getDb(), args as unknown as GetEUBasisInput);
          break;
        case 'get_dutch_implementations':
          result = await getDutchImplementations(getDb(), args as unknown as GetDutchImplementationsInput);
          break;
        case 'search_eu_implementations':
          result = await searchEUImplementations(getDb(), args as unknown as SearchEUImplementationsInput);
          break;
        case 'get_provision_eu_basis':
          result = await getProvisionEUBasis(getDb(), args as unknown as GetProvisionEUBasisInput);
          break;
        case 'validate_eu_compliance':
          result = await validateEUCompliance(getDb(), args as unknown as ValidateEUComplianceInput);
          break;
        case 'get_provision_at_date':
          result = await getProvisionAtDate(getDb(), args as unknown as GetProvisionAtDateInput);
          break;
        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error executing ${name}: ${message}` }],
        isError: true,
      };
    }
  });
}
