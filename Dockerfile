# syntax=docker/dockerfile:1

# ===================================
# Stage 1: Builder
# ===================================
FROM node:22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /build

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and TypeScript configuration
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript to JavaScript
RUN npm run build

# ===================================
# Stage 2: Production
# ===================================
FROM node:22-alpine AS production

# Metadata labels (OCI standard)
LABEL org.opencontainers.image.title="Dutch Law MCP Server"
LABEL org.opencontainers.image.description="Production-grade Dutch legal research MCP server with comprehensive statute coverage and EU law cross-references"
LABEL org.opencontainers.image.authors="Ansvar Systems AB <hello@ansvar.ai>"
LABEL org.opencontainers.image.vendor="Ansvar Systems AB"
LABEL org.opencontainers.image.source="https://github.com/Ansvar-Systems/Dutch-law-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/Ansvar-Systems/Dutch-law-mcp#readme"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.version="1.2.1"

# Install curl/gzip for HTTP health checks and release DB download
RUN apk add --no-cache curl gzip

# Create non-root user for security
RUN addgroup -g 1001 -S mcpserver && \
    adduser -u 1001 -S mcpserver -G mcpserver

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV DUTCH_LAW_DB_PATH=/app/data/database.db
# WASM SQLite loads the entire DB into memory — 64MB DB needs extra heap
ENV NODE_OPTIONS="--max-old-space-size=512"

# MODE controls the entry point: "stdio" (default) or "http"
ENV MODE=stdio
# PORT is only used when MODE=http
ENV PORT=3000

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /build/dist ./dist

# Fetch release database during image build so the image is query-ready
COPY scripts/download-db.sh /app/scripts/download-db.sh
RUN chmod +x /app/scripts/download-db.sh && sh /app/scripts/download-db.sh
RUN node --input-type=module - <<'NODE'
import Database from '@ansvar/mcp-sqlite';
import { searchLegislation } from './dist/tools/search-legislation.js';
const db = new Database('./data/database.db', { readonly: true });
const tables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name)
);
for (const table of ['legal_documents', 'legal_provisions', 'provisions_fts']) {
  if (!tables.has(table)) {
    throw new Error(`Missing required table: ${table}`);
  }
}
const result = await searchLegislation(db, { query: 'persoonsgegevens', limit: 1 });
if (!result.results.length) {
  throw new Error('Search smoke test returned no Dutch law results');
}
db.close();
NODE

# Change ownership to non-root user
RUN chown -R mcpserver:mcpserver /app

# Switch to non-root user
USER mcpserver

# Expose HTTP port (only relevant when MODE=http)
EXPOSE 3000

# Health check: use HTTP endpoint in HTTP mode, file check in stdio mode
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD if [ "$MODE" = "http" ]; then curl -f http://127.0.0.1:${PORT}/health || exit 1; else node -e "require('fs').accessSync('dist/index.js')" || exit 1; fi

# Entry point: select mode via shell
ENTRYPOINT ["sh", "-c", "if [ \"$MODE\" = \"http\" ]; then exec node dist/http-server.js; else exec node dist/index.js; fi"]
