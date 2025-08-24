# Tampermonkey Example (Vite + TypeScript)

This repository is a starter workspace for building Tampermonkey/Greasemonkey userscripts using modern tooling.

Features:
- Vite + TypeScript, builds to a single IIFE userscript file `dist/bundle.user.js`
- Metadata banner injected in the output for Tampermonkey
- Vitest for unit tests
- ESLint + Prettier
- VS Code tasks and recommended extensions
- GitHub Actions CI for lint + test + build

Quick start:

- Install deps: `npm install`
- Dev (iterative testing in browser dev tools): `npm run dev`
- Build userscript: `npm run build` (outputs `dist/bundle.user.js`)
- Run tests: `npm test`

Load in Tampermonkey:
- Build the project, then drag-and-drop `dist/bundle.user.js` into the Tampermonkey dashboard (or import via URL if hosted).

Project layout:
- `src/main.ts` entry point
- `src/utils/greeter.ts` example module
- `tests/greeter.test.ts` unit test
- `.vscode` VS Code config
- `.github/workflows/ci.yml` CI workflow

License: MIT

