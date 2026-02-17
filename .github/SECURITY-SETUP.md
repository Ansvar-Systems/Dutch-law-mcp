# Security Setup

This repository uses required secrets for CI/CD and release workflows.

## Required Secrets

- `NPM_TOKEN`: npm publish token (required by `.github/workflows/publish.yml`)

## Optional Secrets

- `VERCEL_TOKEN`: required only when using `vercel-deploy.yml`
- `VERCEL_ORG_ID`: required only when using `vercel-deploy.yml`
- `VERCEL_PROJECT_ID`: required only when using `vercel-deploy.yml`

## Governance Notes

- Keep branch protection enabled on `main`.
- Require CODEOWNERS review for protected branches.
- Keep required status checks aligned with architecture governance policy.

Last updated: 2026-02-17
