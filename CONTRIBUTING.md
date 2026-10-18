# Contributing

Contributions to Evidence Check are welcome. Keep changes within document
organization, claim extraction, source attribution, and human verification.
Do not add rebuttal writing, speaking cards, crossfire, competition workflows,
web search, or live provider calls without a separately approved scope.

## Development

Use Node.js 20 or newer:

```sh
npm install
cp .env.example .env
npm run dev
```

Before opening a pull request, run:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Do not commit credentials, uploaded documents, personal data, or real debate
drafts. Test fixtures and screenshots must use fictional, anonymized data.
Keep extraction output unverified until a human explicitly reviews it.

By submitting a contribution, you agree that it may be distributed under the
project's AGPL-3.0-only license.
