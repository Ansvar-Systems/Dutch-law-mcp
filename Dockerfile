# MCP Server — Hetzner / Kubernetes
# Image contract: docs/superpowers/specs/2026-04-25-mcp-infrastructure-standard-design.md §3
# Profile: node-wasm (runtime: @ansvar/mcp-sqlite WASM — no native runtime compile)
# DB pattern: built (data/database.db)
# Build-time native compile (better-sqlite3 in devDeps for build:db): False

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts && npm cache clean --force
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build
COPY data/ ./data/
RUN if npm run 2>/dev/null | grep -q "build:db"; then npm run build:db; fi

FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nodejs -G nodejs

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/data ./data

# Ensure /app/data exists and is writable by the runtime user.
# SQLite needs to write -wal/-shm sidecars in the DB directory.
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

USER nodejs

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/http-server.js"]
