# Security Policy

## Supported Versions

Security updates are focused on the latest `main` branch and active deployment branch.

## Reporting a Vulnerability

Please report vulnerabilities privately:

- Email: security@bynolo.ca
- Subject: `[Vinyl Vote Security] <short summary>`

Include:

- Affected area and impact
- Steps to reproduce
- Proof-of-concept details
- Suggested mitigation (if available)

We will acknowledge within 72 hours and provide status updates while investigating.

## Secrets and Sensitive Data

Do not commit:

- `.env` files
- Database files (`*.db`, `*.sqlite*`)
- Private keys or API credentials
- Local virtualenv folders

Before making the repository public, rotate any credential that may have been exposed in history.
