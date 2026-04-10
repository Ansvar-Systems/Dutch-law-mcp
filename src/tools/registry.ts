/**
 * Tool registry — shared between stdio and HTTP entry points.
 *
 * Exports the TOOLS array (tool definitions) and `registerTools()` which wires
 * up ListTools + CallTool handlers on any MCP Server instance.
 */

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type Database from '@ansvar/mcp-sqlite';

import { searchLegislation, type SearchLegislationInput } from './search-legislation.js';
import { getProvision, type GetProvisionInput } from './get-provision.js';
import { searchCaseLaw, type SearchCaseLawInput } from './search-case-law.js';
import {
  searchParliamentaryProceedings,
  type SearchParliamentaryProceedingsInput,
} from './search-parliamentary-proceedings.js';
import { getPreparatoryWorks, type GetPreparatoryWorksInput } from './get-preparatory-works.js';
import { validateCitationTool, type ValidateCitationInput } from './validate-citation.js';
import { buildLegalStance, type BuildLegalStanceInput } from './build-legal-stance.js';
import { formatCitationTool, type FormatCitationInput } from './format-citation.js';
import { checkCurrency, type CheckCurrencyInput } from './check-currency.js';
import { getEUBasis, type GetEUBasisInput } from './get-eu-basis.js';
import {
  getDutchImplementations,
  type GetDutchImplementationsInput,
} from './get-dutch-implementations.js';
import {
  searchEUImplementations,
  type SearchEUImplementationsInput,
} from './search-eu-implementations.js';
import { getProvisionEUBasis, type GetProvisionEUBasisInput } from './get-provision-eu-basis.js';
import { validateEUCompliance, type ValidateEUComplianceInput } from './validate-eu-compliance.js';
import { getProvisionAtDate, type GetProvisionAtDateInput } from './get-provision-at-date.js';
import { listSources, type ListSourcesInput } from './list-sources.js';
import { about, type AboutInput } from './about.js';
import { checkDataFreshness, type CheckDataFreshnessInput } from './check-data-freshness.js';
import { validateInput, COMMON_FIELDS } from '../utils/validate-input.js';

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
} as const;

function toTitle(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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
      'Search Dutch statutes and regulations by keyword using full-text search (FTS5 with BM25 ranking). Data sourced from wetten.overheid.nl (BWB). Returns matching provisions with article text, statute title, and BWB-ID. Use document_id to narrow to a specific statute. Use as_of_date to query historical versions. Returns empty array (not error) when no results match. Use get_provision instead when you already know the exact BWB-ID and article number.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Search terms in Dutch or English. Examples: "onrechtmatige daad", "arbeidsovereenkomst", "privacy". Multi-word queries use AND logic with OR fallback.',
        },
        document_id: {
          type: 'string',
          description:
            'BWB-ID to restrict search to a specific statute (e.g. "BWBR0005289" for Burgerlijk Wetboek)',
        },
        status: {
          type: 'string',
          description:
            'Filter by status: in_force (geldend), repealed (ingetrokken), amended (gewijzigd)',
          enum: ['in_force', 'repealed', 'amended'],
        },
        as_of_date: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD) to query historical versions of provisions',
        },
        limit: {
          type: 'number',
          description: 'Max results (1-50, default 10). Higher values use more tokens.',
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description:
      'Retrieve a specific provision (article) from a Dutch statute by BWB-ID. Returns the full article text, metadata, and source URL. If no article is specified, returns all provisions of the statute (use with care — large statutes may have 100+ articles). Examples: document_id="BWBR0005289", book="6", article="162" for Art. 6:162 BW; document_id="BWBR0001854", article="287" for Art. 287 Sr. Use search_legislation if you don\'t know the BWB-ID. Use get_provision_at_date if you need a historical version.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: {
          type: 'string',
          description: 'BWB-ID of the statute (e.g. "BWBR0005289" for BW Boek 6)',
        },
        book: { type: 'string', description: 'Book number if applicable (e.g. "6" for BW Boek 6)' },
        article: { type: 'string', description: 'Article number (e.g. "162")' },
        provision_ref: {
          type: 'string',
          description: 'Full provision reference (e.g. "6:162" or "287")',
        },
        as_of_date: { type: 'string', description: 'ISO date to retrieve historical version' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'search_case_law',
    description:
      'Search Dutch court decisions from rechtspraak.nl (202K+ decisions). Returns ECLI identifier, court, date, summary, and keywords. Supports FTS search with filters for court, legal domain, procedure type, and date range. For direct ECLI lookup, use the ecli parameter instead of query. Note: case law is only available in the professional tier — free tier returns an upgrade notice. Returns empty array when no results match.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search terms' },
        court: {
          type: 'string',
          description:
            'Court code: HR (Hoge Raad), RVS (Raad van State), RBAMS (Rechtbank Amsterdam), etc.',
        },
        ecli: { type: 'string', description: 'Direct ECLI lookup (e.g. "ECLI:NL:HR:2019:376")' },
        legal_domain: {
          type: 'string',
          description: 'Legal domain filter (e.g. "civiel", "straf", "bestuursrecht")',
        },
        procedure_type: {
          type: 'string',
          description: 'Procedure type filter (e.g. "cassatie", "hoger beroep")',
        },
        date_from: { type: 'string', description: 'Start date filter (ISO format)' },
        date_to: { type: 'string', description: 'End date filter (ISO format)' },
        limit: { type: 'number', description: 'Max results (1-50, default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'search_parliamentary_proceedings',
    description:
      'Search Dutch parliamentary proceedings (Tweede Kamer/Handelingen) from the ParlaMint-NL corpus. ' +
      'Returns floor speeches, motions, and debate transcripts with speaker metadata. ' +
      'Useful for understanding legislative intent, political debate context, and parliamentary questions on specific topics. ' +
      'Supports FTS search with date range filters. ' +
      'Note: this data covers Tweede Kamer speeches only, not Eerste Kamer. ' +
      'Professional tier only — free tier returns an upgrade notice. Returns empty array when no results match.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Search terms in Dutch or English. Examples: "privacy persoonsgegevens", "energietransitie", "woningmarkt".',
        },
        date_from: {
          type: 'string',
          description: 'Start date filter (ISO format, e.g. "2020-01-01")',
        },
        date_to: { type: 'string', description: 'End date filter (ISO format, e.g. "2024-12-31")' },
        limit: { type: 'number', description: 'Max results (1-50, default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_preparatory_works',
    description:
      'Get preparatory works (kamerstukken/travaux preparatoires) for a Dutch statute. Returns parliamentary documents: memorie van toelichting (MvT), memorie van antwoord (MvA), nota naar aanleiding van het verslag, and amendments. Professional tier only — free tier returns an upgrade notice. Use when you need legislative intent or historical context for a statute.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        statute_id: { type: 'string', description: 'BWB-ID of the statute (e.g. "BWBR0005289")' },
        document_type: {
          type: 'string',
          description: 'Filter by type: MvT, MvA, amendement, nota, etc.',
        },
        limit: { type: 'number', description: 'Max results (1-50, default 20)' },
      },
      required: ['statute_id'],
    },
  },
  {
    name: 'validate_citation',
    description:
      'Validate a Dutch legal citation against the database — checks whether the referenced document and provision actually exist. Use this to verify citations before including them in legal analysis (zero-hallucination check). Supported formats: "Art. 6:162 BW", "art. 287 Sr", "ECLI:NL:HR:2019:376", "Kamerstukken II 2020/21, 35815, nr. 2". Returns validation status with details on what was/wasn\'t found. Use format_citation instead if you just need to format a citation string.',
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
      'Build a comprehensive legal stance on a topic by aggregating statute provisions, case law, preparatory works, and cross-references into a single structured response. Best for broad legal research questions. Gracefully degrades on free tier (omits case law and preparatory works). Use search_legislation or get_provision for targeted single-source queries instead.',
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
      'Format a Dutch legal citation string into standard Dutch legal citation format. Pure formatting — no database lookup, no validation. Supports full (formal), short (abbreviated), and pinpoint (with subsection) formats. Use validate_citation instead if you need to verify the citation actually exists.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        citation: { type: 'string', description: 'Citation string to format' },
        format: {
          type: 'string',
          description: 'Output format: full, short, or pinpoint',
          enum: ['full', 'short', 'pinpoint'],
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description:
      'Check whether a Dutch statute or provision is currently in force (geldend recht). Returns status (in_force/repealed/not_yet_in_force), in-force date, and any warnings. Essential before relying on a provision — always check currency for legal advice. Optionally checks a specific provision and date. Also returns related case law cross-references when available.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the statute to check' },
        provision_ref: {
          type: 'string',
          description: 'Provision reference to check (e.g. "6:162")',
        },
        as_of_date: {
          type: 'string',
          description: 'ISO date to check validity at a specific point in time',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_eu_basis',
    description:
      'Get the EU legal basis (directives/regulations) for a Dutch statute. Returns CELEX numbers, EUR-Lex links, reference types (implements/references/supplements), and whether it is a primary implementation. Use get_provision_eu_basis for provision-level EU references. Use get_dutch_implementations for the reverse lookup (EU act → Dutch laws).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: {
          type: 'string',
          description: 'BWB-ID of the Dutch statute (e.g. "BWBR0005289")',
        },
        include_articles: {
          type: 'boolean',
          description: 'Include referenced EU articles (default false)',
        },
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
      'Reverse EU lookup: find which Dutch statutes implement a given EU directive or regulation. Returns BWB-IDs, statute titles, and implementation status. Use get_eu_basis for the forward lookup (Dutch law → EU basis). The eu_document_id format is "directive:YYYY/NNN" or "regulation:YYYY/NNN" (e.g. "directive:2016/679" for GDPR).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        eu_document_id: {
          type: 'string',
          description: 'EU document ID to look up implementations for',
        },
        primary_only: {
          type: 'boolean',
          description: 'Only return primary implementations (default false)',
        },
        in_force_only: {
          type: 'boolean',
          description: 'Only return statutes that are currently in force (default false)',
        },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description:
      'Search EU directives and regulations in the database (1,008 documents). Returns EU document metadata with Dutch implementation counts. Filter by type (directive/regulation), year range, community (EU/EG/EEG), and whether a Dutch implementation exists. Use when browsing EU instruments rather than looking up a specific one.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search terms for EU document titles' },
        type: {
          type: 'string',
          description: 'Filter by type: directive or regulation',
          enum: ['directive', 'regulation'],
        },
        year_from: { type: 'number', description: 'Start year filter' },
        year_to: { type: 'number', description: 'End year filter' },
        community: {
          type: 'string',
          description: 'EU community: EU, EG, EEG, Euratom',
          enum: ['EU', 'EG', 'EEG', 'Euratom'],
        },
        has_dutch_implementation: {
          type: 'boolean',
          description: 'Filter by whether a Dutch implementation exists',
        },
        limit: { type: 'number', description: 'Max results (1-100, default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_provision_eu_basis',
    description:
      'Get EU references for a specific provision (article) in a Dutch statute. Shows which EU directive/regulation articles are referenced or implemented by that Dutch provision. More granular than get_eu_basis (which works at statute level). Returns empty results if no EU references exist for that provision.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the Dutch statute' },
        provision_ref: {
          type: 'string',
          description: 'Provision reference (e.g. "6:162" or "287")',
        },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description:
      'Validate EU compliance for a Dutch statute. Checks for missing, partial, or outdated implementations of EU directives/regulations. Returns compliance issues with severity levels (high/medium/low) and recommendations in Dutch. Optionally narrow to a specific provision or EU document. Use get_eu_basis first to see what EU instruments apply.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the Dutch statute to validate' },
        provision_ref: { type: 'string', description: 'Provision reference to narrow the check' },
        eu_document_id: {
          type: 'string',
          description: 'EU document ID to check compliance against',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_provision_at_date',
    description:
      'Retrieve a provision as it was at a specific historical date. Uses version history to return the text valid at that date. Essential for analyzing past legal situations or tracking how a provision changed over time. Set include_amendments=true to see the full amendment chain. Returns not_found if no version exists for that date. Use get_provision for the current version instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'BWB-ID of the statute (e.g. "BWBR0005289")' },
        provision_ref: {
          type: 'string',
          description: 'Provision reference (e.g. "6:162" or "287")',
        },
        date: { type: 'string', description: 'ISO date to query the provision at (YYYY-MM-DD)' },
        include_amendments: {
          type: 'boolean',
          description: 'Include amendment history records (default false)',
        },
      },
      required: ['document_id', 'provision_ref', 'date'],
    },
  },
  {
    name: 'list_sources',
    description:
      'List the authoritative data sources backing this server. Returns provenance metadata for each source (wetten.overheid.nl, rechtspraak.nl, EUR-Lex) including coverage, licensing, freshness, and update frequency. Use this tool to verify data origin and understand what data is available. Set include_stats=true to get row counts per table.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        include_stats: {
          type: 'boolean',
          description: 'Include database statistics (row counts per table). Default false.',
        },
      },
      required: [],
    },
  },
  {
    name: 'about',
    description:
      'Return server identity, version, data sources, and runtime capabilities. Use this tool to discover what tier and capabilities are available (free vs professional), which data sources are bundled, and the server version. Equivalent to reading the MCP resource `case-law-stats://dutch-law-mcp/metadata` but callable as a tool.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'check_data_freshness',
    description:
      'Check the freshness (age) of each data source in the bundled database. Returns last-updated timestamps and a fresh/stale/unknown status per source (statutes, case_law, eu_references). Use this before relying on legal data for time-sensitive analysis. Staleness thresholds: statutes 30 days, case_law 14 days, eu_references 90 days.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description: 'Limit check to a single source. Omit to check all sources.',
          enum: ['statutes', 'case_law', 'eu_references'],
        },
      },
      required: [],
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
export function registerTools(server: Server, getDb: () => InstanceType<typeof Database>): void {
  const toolsWithAnnotations = annotateTools(TOOLS);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolsWithAnnotations,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;
      const a = args ?? {};

      switch (name) {
        case 'search_legislation':
          validateInput(name, a, [COMMON_FIELDS.query(), COMMON_FIELDS.limit]);
          result = await searchLegislation(getDb(), a as unknown as SearchLegislationInput);
          break;
        case 'get_provision': {
          // Accept 'law' as an alias for 'document_id' (used by fleet audit and some agents).
          // Accept 'section' as an alias for 'article' (used by fleet contract tests).
          const provisionArgs = { ...a } as Record<string, unknown>;
          if (!provisionArgs['document_id'] && provisionArgs['law']) {
            provisionArgs['document_id'] = provisionArgs['law'];
          }
          if (!provisionArgs['article'] && provisionArgs['section']) {
            provisionArgs['article'] = provisionArgs['section'];
          }
          validateInput(name, provisionArgs, [COMMON_FIELDS.document_id()]);
          result = await getProvision(getDb(), provisionArgs as unknown as GetProvisionInput);
          break;
        }
        case 'search_case_law':
          result = await searchCaseLaw(getDb(), a as unknown as SearchCaseLawInput);
          break;
        case 'search_parliamentary_proceedings':
          validateInput(name, a, [COMMON_FIELDS.query()]);
          result = await searchParliamentaryProceedings(
            getDb(),
            a as unknown as SearchParliamentaryProceedingsInput,
          );
          break;
        case 'get_preparatory_works':
          validateInput(name, a, [
            { name: 'statute_id', type: 'string', required: true, maxLength: 50 },
          ]);
          result = await getPreparatoryWorks(getDb(), a as unknown as GetPreparatoryWorksInput);
          break;
        case 'validate_citation':
          validateInput(name, a, [COMMON_FIELDS.citation()]);
          result = await validateCitationTool(getDb(), a as unknown as ValidateCitationInput);
          break;
        case 'build_legal_stance':
          validateInput(name, a, [COMMON_FIELDS.query()]);
          result = await buildLegalStance(getDb(), a as unknown as BuildLegalStanceInput);
          break;
        case 'format_citation':
          validateInput(name, a, [COMMON_FIELDS.citation()]);
          result = await formatCitationTool(a as unknown as FormatCitationInput);
          break;
        case 'check_currency':
          validateInput(name, a, [COMMON_FIELDS.document_id()]);
          result = await checkCurrency(getDb(), a as unknown as CheckCurrencyInput);
          break;
        case 'get_eu_basis':
          validateInput(name, a, [COMMON_FIELDS.document_id()]);
          result = await getEUBasis(getDb(), a as unknown as GetEUBasisInput);
          break;
        case 'get_dutch_implementations':
          validateInput(name, a, [
            { name: 'eu_document_id', type: 'string', required: true, maxLength: 100 },
          ]);
          result = await getDutchImplementations(
            getDb(),
            a as unknown as GetDutchImplementationsInput,
          );
          break;
        case 'search_eu_implementations':
          result = await searchEUImplementations(
            getDb(),
            a as unknown as SearchEUImplementationsInput,
          );
          break;
        case 'get_provision_eu_basis':
          validateInput(name, a, [COMMON_FIELDS.document_id(), COMMON_FIELDS.provision_ref()]);
          result = await getProvisionEUBasis(getDb(), a as unknown as GetProvisionEUBasisInput);
          break;
        case 'validate_eu_compliance':
          validateInput(name, a, [COMMON_FIELDS.document_id()]);
          result = await validateEUCompliance(getDb(), a as unknown as ValidateEUComplianceInput);
          break;
        case 'get_provision_at_date':
          validateInput(name, a, [
            COMMON_FIELDS.document_id(),
            COMMON_FIELDS.provision_ref(),
            { name: 'date', type: 'string', required: true, maxLength: 10 },
          ]);
          result = await getProvisionAtDate(getDb(), a as unknown as GetProvisionAtDateInput);
          break;
        case 'list_sources':
          result = await listSources(getDb(), a as unknown as ListSourcesInput);
          break;
        case 'about':
          result = await about(getDb(), a as unknown as AboutInput);
          break;
        case 'check_data_freshness':
          result = await checkDataFreshness(getDb(), a as unknown as CheckDataFreshnessInput);
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
