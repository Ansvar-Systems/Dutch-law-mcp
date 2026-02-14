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
LABEL org.opencontainers.image.version="1.0.0"

# Create non-root user for security
RUN addgroup -g 1001 -S mcpserver && \
    adduser -u 1001 -S mcpserver -G mcpserver

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV DUTCH_LAW_DB_PATH=/app/data/database.db

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /build/dist ./dist

# Copy database (225MB SQLite file)
COPY data/database.db ./data/database.db

# Change ownership to non-root user
RUN chown -R mcpserver:mcpserver /app

# Switch to non-root user
USER mcpserver

# Health check (MCP servers communicate over stdio, so we check if the binary exists)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('fs').accessSync('dist/index.js')" || exit 1

# Entry point (MCP server communicates over stdio)
ENTRYPOINT ["node", "dist/index.js"]
