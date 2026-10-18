# Security policy

## Supported version

Security fixes are accepted for the current default branch.

## Reporting a vulnerability

Please do not open a public issue containing exploit details or private data.
Use GitHub's private vulnerability reporting for this repository, or contact
the maintainers privately through GitHub.

## Starter security boundaries

This project is a local-development starter and is not safe to expose as a
hosted multi-user service. It has no authentication or authorization. Uploaded
documents are stored locally; do not upload sensitive material to a shared or
untrusted machine. The mock extraction provider makes no external requests and
does not verify claims.
