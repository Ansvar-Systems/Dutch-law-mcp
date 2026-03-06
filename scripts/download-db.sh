#!/bin/bash
# Download pre-built database from GitHub Releases.
#
# Use this instead of running slow government API ingestion locally.
# The database.db.gz asset is published automatically by the publish
# workflow on every tagged release.
#
# Usage:
#   bash scripts/download-db.sh           # download latest release
#   bash scripts/download-db.sh v1.2.0    # download specific version
#
# The script reads the repo name from package.json so it works
# across all Law MCPs without modification.
set -e

TAG="${1:-}"
ASSET="database.db.gz"
OUTPUT="data/database.db"

# Read repo from package.json repository field
REPO=$(node -p "
  const pkg = require('./package.json');
  const url = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url || '');
  url.replace(/^.*github\\.com\\//, '').replace(/\\.git$/, '')
")

if [ -z "$REPO" ] || [ "$REPO" = "undefined" ]; then
  echo "[download-db] ERROR: Could not determine repo from package.json repository field"
  exit 1
fi

# Skip if already exists (unless --force)
if [ -f "$OUTPUT" ] && [ "$2" != "--force" ]; then
  SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
  echo "[download-db] Database already exists at $OUTPUT ($SIZE), skipping"
  echo "[download-db] Use --force as second argument to re-download"
  exit 0
fi

# Resolve tag from package.json version if not specified
if [ -z "$TAG" ]; then
  TAG="v$(node -p "require('./package.json').version")"
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
echo "[download-db] Downloading database from GitHub Releases..."
echo "  Repo:    ${REPO}"
echo "  Tag:     ${TAG}"
echo "  URL:     ${URL}"

mkdir -p data
curl -fSL --retry 3 --retry-delay 5 "$URL" | gunzip > "${OUTPUT}.tmp"
mv "${OUTPUT}.tmp" "$OUTPUT"

SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
echo "[download-db] Database ready: $OUTPUT ($SIZE)"
