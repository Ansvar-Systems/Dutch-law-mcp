# Tools — Dutch Law MCP

8 tools for searching and retrieving Dutch legislation.

---

## 1. search_legislation

Full-text search across all Dutch statutes and regulations.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `limit` | number | No | Max results (default 10, max 50) |
| `status` | string | No | Filter: `in_force`, `amended`, `repealed` |

**Returns:** Matching provisions with document context, snippets, and relevance scores.

---

## 2. get_provision

Retrieve the full text of a specific provision from a statute.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | Statute identifier or title |
| `section` | string | No | Section/article number |

**Returns:** Full provision text with document metadata.

---

## 3. list_sources

List all data sources with provenance metadata and database statistics.

**Returns:** Source authority, coverage scope, document/provision counts, and build date.

---

## 4. validate_citation

Validate a legal citation against the database (zero-hallucination check).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `citation` | string | Yes | Citation string to validate |

**Returns:** Whether the cited document and provision exist, with warnings.

---

## 5. build_legal_stance

Build a comprehensive set of citations for a legal question.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Legal question or topic |
| `limit` | number | No | Max results per category (default 5) |

**Returns:** Aggregated relevant provisions from multiple statutes.

---

## 6. format_citation

Format a legal citation per standard conventions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `citation` | string | Yes | Citation to format |
| `format` | string | No | `full`, `short`, or `pinpoint` |

**Returns:** Formatted citation string.

---

## 7. check_currency

Check whether a statute or provision is currently in force.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | Statute identifier or title |
| `provision_ref` | string | No | Optional provision reference |

**Returns:** Status (in_force/amended/repealed), dates, and warnings.

---

## 8. about

Server metadata, dataset statistics, and data freshness.

**Returns:** Document/provision counts, build date, source authority, and database version.
