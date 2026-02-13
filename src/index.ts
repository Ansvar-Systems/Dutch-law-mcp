#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { searchLegislation, type SearchLegislationInput } from './tools/search-legislation.js';
import { getProvision, type GetProvisionInput } from './tools/get-provision.js';
import { searchCaseLaw, type SearchCaseLawInput } from './tools/search-case-law.js';
import { getPreparatoryWorks, type GetPreparatoryWorksInput } from './tools/get-preparatory-works.js';
import { validateCitationTool, type ValidateCitationInput } from './tools/validate-citation.js';
import { buildLegalStance, type BuildLegalStanceInput } from './tools/build-legal-stance.js';
import { formatCitationTool, type FormatCitationInput } from './tools/format-citation.js';
import { checkCurrency, type CheckCurrencyInput } from './tools/check-currency.js';
import { getEUBasis, type GetEUBasisInput } from './tools/get-eu-basis.js';
import { getDutchImplementations, type GetDutchImplementationsInput } from './tools/get-dutch-implementations.js';
import { searchEUImplementations, type SearchEUImplementationsInput } from './tools/search-eu-implementations.js';
import { getProvisionEUBasis, type GetProvisionEUBasisInput } from './tools/get-provision-eu-basis.js';
import { validateEUCompliance, type ValidateEUComplianceInput } from './tools/validate-eu-compliance.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVER_NAME = 'dutch-legal-citations';
const SERVER_VERSION = '1.0.0';
const DB_ENV_VAR = 'DUTCH_LAW_DB_PATH';
const DEFAULT_DB_PATH = '../data/database.db';

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDefaultDbPath(): string {
  return path.resolve(__dirname, DEFAULT_DB_PATH);
}

let dbInstance: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!dbInstance) {
    const dbPath = process.env[DB_ENV_VAR] ?? getDefaultDbPath();
    dbInstance = new Database(dbPath, { readonly: true });
    dbInstance.pragma('journal_mode = WAL', { simple: true });
  }
  return dbInstance;
}

function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [
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
];

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'case-law-stats://dutch-law-mcp/metadata',
      name: 'Dutch Legal Database Metadata',
      description:
        'Metadata about the Dutch legal database including data sources, coverage, and freshness.',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'case-law-stats://dutch-law-mcp/metadata') {
    const metadata = {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      sources: {
        statutes: {
          name: 'wetten.overheid.nl',
          description: 'Official BWB (Basiswettenbestand) for Dutch statutes and regulations',
          url: 'https://wetten.overheid.nl',
          license: 'Open Data',
        },
        case_law: {
          name: 'rechtspraak.nl',
          description: 'Official open data portal for Dutch court decisions',
          url: 'https://uitspraken.rechtspraak.nl',
          license: 'Open Data',
        },
        eu_law: {
          name: 'EUR-Lex',
          description: 'Official EU legislation database',
          url: 'https://eur-lex.europa.eu',
          license: 'Open Data',
        },
      },
      attribution:
        'Data sourced from wetten.overheid.nl and rechtspraak.nl. Case law metadata provided under Open Data license.',
    };

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(metadata, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server started on stdio`);
}

process.on('SIGINT', () => {
  console.error(`[${SERVER_NAME}] Shutting down (SIGINT)...`);
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error(`[${SERVER_NAME}] Shutting down (SIGTERM)...`);
  closeDb();
  process.exit(0);
});

main().catch((error: unknown) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  closeDb();
  process.exit(1);
});
