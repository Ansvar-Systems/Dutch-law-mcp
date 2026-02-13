# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

We support only the latest minor version. Please upgrade to receive security patches.

## Security Scanning

This project uses multiple layers of automated security scanning:

### Dependency Vulnerabilities
- **Dependabot**: Automated dependency updates (weekly)
- **npm audit**: Runs on every CI build
- **Socket.dev**: Supply chain attack detection

### Code Analysis
- **CodeQL**: Static analysis for security vulnerabilities (weekly + on PRs)
- **Semgrep**: SAST scanning for OWASP top 10, secrets, and TypeScript-specific issues
- **Trivy**: Filesystem and dependency vulnerability scanning
- **Gitleaks**: Secret detection across git history

### What We Scan For
- Known CVEs in dependencies
- SQL injection vulnerabilities
- Cross-site scripting (XSS)
- Regular expression denial of service (ReDoS)
- Path traversal attacks
- Supply chain attacks (malicious packages, typosquatting)
- Hardcoded secrets and credentials

## Reporting a Vulnerability

If you discover a security vulnerability:

1. **Do NOT open a public GitHub issue**
2. Email: hello@ansvar.ai
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

We will respond within 48 hours and provide a timeline for a fix.

## Security Best Practices

This project follows security best practices:

- All database queries use prepared statements (no SQL injection)
- Input validation on all user-provided parameters
- Read-only database access (no write operations at runtime)
- No execution of user-provided code
- Automated security testing in CI/CD
- Regular dependency updates via Dependabot

## Database Security

### Legal Database (SQLite)

The legal database (`data/database.db`) is:
- Pre-built and version-controlled (tamper evident)
- Opened in read-only mode at runtime (no write risk)
- Source data from official wetten.overheid.nl and rechtspraak.nl (auditable)
- Ingestion scripts require manual execution (no auto-download at runtime)

## Third-Party Dependencies

We minimize dependencies and regularly audit:
- Core runtime: Node.js, TypeScript, better-sqlite3
- MCP SDK: Official Anthropic package
- No unnecessary dependencies

All dependencies are tracked via `package-lock.json` and scanned for vulnerabilities.

---

**Last Updated**: 2026-02-13
