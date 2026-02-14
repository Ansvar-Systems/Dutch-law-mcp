#!/bin/bash
# Download free-tier database from GitHub Releases for Vercel deployment.
#
# Called by vercel.json buildCommand before TypeScript compilation.
# The database-free.db.gz asset must be published to the matching
# GitHub Release (vX.Y.Z tag) before deploying.
#
# To publish a new free-tier DB:
#   npm run build:db:free
#   gzip -k data/database-free.db
#   gh release upload v$(node -p "require('./package.json').version") data/database-free.db.gz --clobber
set -e

VERSION=$(node -p "require('./package.json').version")
REPO="Ansvar-Systems/Dutch-law-mcp"
TAG="v${VERSION}"
ASSET="database-free.db.gz"
OUTPUT="data/database-free.db"

# Skip if already exists (local development)
if [ -f "$OUTPUT" ]; then
  echo "[download-free-db] Database already exists at $OUTPUT, skipping download"
  exit 0
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
echo "[download-free-db] Downloading free-tier database..."
echo "  URL: ${URL}"

mkdir -p data
curl -fSL --retry 3 --retry-delay 5 "$URL" | gunzip > "${OUTPUT}.tmp"
mv "${OUTPUT}.tmp" "$OUTPUT"

SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
echo "[download-free-db] Database ready: $OUTPUT ($SIZE)"
