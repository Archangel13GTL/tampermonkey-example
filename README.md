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
🎉 **Repository Successfully Createdstatus*

View your project at: https://github.com/Archangel13GTL/tampermonkey-example

## What's Included:
- ✅ Complete Tampermonkey userscript development setup
- ✅ TypeScript + Vite build system
- ✅ Vitest testing framework
- ✅ ESLint + Prettier code quality
- ✅ VS Code workspace integration
- ✅ GitHub Actions CI/CD pipeline
- ✅ WARP.md for AI agent guidance
- ✅ Automatic Tampermonkey metadata injection

## Start Developing:
```bash
# Open in VS Code
code tampermonkey-example.code-workspace

# Build userscript
npm run build  # or Ctrl+Shift+B

# Run tests  
npm test

# Install in Tampermonkey
# Drag dist/bundle.user.js to Tampermonkey dashboard
```
