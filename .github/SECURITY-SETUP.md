# Security Setup for GitHub Actions

This document describes the secrets and configuration required for the Dutch Law Law MCP GitHub Actions workflows.

## Required Secrets

| Secret | Used By | Description |
|--------|---------|-------------|
| `NPM_TOKEN` | `publish.yml` | npm automation token for publishing `@ansvar/dutch-law-mcp` |

### Setting up NPM_TOKEN

1. Go to [npmjs.com](https://www.npmjs.com/) and sign in
2. Navigate to **Access Tokens** > **Generate New Token**
3. Select **Granular Access Token** with:
   - **Packages and scopes**: Read and write, scoped to `@ansvar/dutch-law-mcp`
   - **Organizations**: No access needed
4. Copy the generated token
5. In the GitHub repository, go to **Settings** > **Secrets and variables** > **Actions**
6. Click **New repository secret**
7. Name: `NPM_TOKEN`, Value: the token from step 4

## Workflow Permissions

All workflows follow the principle of least privilege:

| Workflow | Permissions | Notes |
|----------|-------------|-------|
| `ci.yml` | `contents: read` | Build and test only |
| `semgrep.yml` | `contents: read`, `security-events: write` | SARIF upload |
| `trivy.yml` | `contents: read`, `security-events: write` | SARIF upload |
| `ossf-scorecard.yml` | `contents: read`, `security-events: write`, `id-token: write`, `actions: read` | Scorecard publish + SARIF |
| `publish.yml` | `contents: write`, `id-token: write` | npm provenance + GitHub Release |
| `check-updates.yml` | `contents: read`, `issues: write` | Creates issues for data updates |
| `drift-detect.yml` | `contents: read` | Data integrity checks |

## GitHub Repository Settings

Ensure the following are enabled in **Settings** > **Code security and analysis**:

- **Dependency graph**: Enabled
- **Dependabot alerts**: Enabled
- **Code scanning**: Enabled (receives SARIF from Semgrep, Trivy, Scorecard)
- **Secret scanning**: Enabled
