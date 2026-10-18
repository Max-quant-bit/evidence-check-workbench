# Evidence Check Workbench

An open-source starter for organizing source documents, preserving paragraph
locations, and reviewing structured claim-extraction output. This is an
**Evidence Check** tool only: it does not draft rebuttals, speaking cards, or
crossfire material, and it is not a competition workflow.

## Local setup

Requirements: Node.js 22.13 or newer and npm.

```sh
git clone https://github.com/Max-quant-bit/evidence-check-workbench.git
cd evidence-check-workbench
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL printed by the dev server (normally
<http://localhost:5173>). The `predev` script creates the local SQLite schema
before starting the API and UI. No API keys are needed; extraction uses a mock
provider.

To build and run the production app locally:

```sh
npm run db:push
npm run build
NODE_ENV=production npm start
```

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Folder overview

- `src/client/` — React upload, project, paragraph, and review UI.
- `src/server/` — Express API, document parsers, SQLite/Drizzle schema, and
  provider interface.
- `src/shared/` — strict Zod schemas shared between extraction and API code.
- `scripts/` — local database setup helpers.
- `.github/workflows/` — continuous integration.
- `.data/` — private local database and uploaded files (ignored by Git).

## Included in this starter

- Create/select projects and upload DOCX, PDF, or UTF-8 TXT files up to 10 MB
  (maximum 5,000 parsed paragraphs per document).
- Parse DOCX with Mammoth, PDF text with pdfjs, and TXT directly. Paragraph
  order and PDF page numbers are kept; there is no OCR.
- Store projects, documents, paragraph chunks, evidence claims, source
  candidates, and users with SQLite and Drizzle.
- Run a mock claim extractor whose results are explicitly marked unverified.
  A person can mark each result as human verified in the UI.
- Use a strict Zod output contract and a replaceable LLM provider interface.

## Deferred

No live LLM provider, API-key usage, web search/source fetching, OCR,
authentication, or multi-user permissions are implemented. The source
candidate and user tables are schema foundations only. The mock provider is
not evidence and should never be treated as a factual verification.

## Security and privacy notes

- Uploads are restricted by extension and MIME type, held in memory only up to
  the 10 MB limit, and stored under random names in `.data/uploads/` with
  restrictive directory/file permissions. Original names are display labels;
  local storage keys and filesystem paths are not returned by the API.
- DOCX-generated HTML is sanitized before conversion to text. Extracted text is
  rendered as React text, not injected HTML. The app does not fetch URLs from
  documents or send documents to an external service.
- This is a local-development starter, not a hardened hosted service: it has
  no authentication, authorization, or user isolation. Do not expose it to an
  untrusted network or store sensitive source material without adding those
  controls.
- `.env` and `.data/` are ignored. Do not add real API keys or real debate
  drafts to the repository. Any future demo fixtures must be fictional and
  anonymized.

Licensed under AGPL-3.0-only; see [LICENSE](LICENSE).
