# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a TypeScript-based Tampermonkey/Greasemonkey userscript development template using modern tooling. The project builds a single IIFE bundle with Tampermonkey metadata for browser userscript execution.

## Development Commands

### Core Development Workflow
```bash
# Install dependencies
npm install

# Development server (for testing in browser dev tools)
npm run dev

# Build userscript for Tampermonkey
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format
```

### Testing Single Files
```bash
# Run specific test file
npx vitest run tests/greeter.test.ts

# Run tests with coverage
npm test -- --coverage
```

## Build System Architecture

### Build Process
The project uses a two-step build process:
1. **Vite Build**: Compiles TypeScript to a single IIFE bundle (`dist/bundle.user.js`)
2. **Post-Build Script**: `scripts/build-userscript.cjs` optionally copies to a target directory

### Key Configuration Files
- **`vite.config.ts`**: Configures IIFE build format and injects Tampermonkey metadata banner
- **`tsconfig.json`**: TypeScript configuration targeting ES2020 with DOM types
- **`.eslintrc.json`**: ESLint setup with TypeScript and import plugins
- **`.prettierrc.json`**: Code formatting configuration

### Build Output
- Output: `dist/bundle.user.js` - Ready-to-install Tampermonkey userscript
- Metadata banner includes `@match`, `@grant`, `@run-at` directives

## Code Architecture

### Entry Point
- **`src/main.ts`**: Main userscript entry point wrapped in IIFE
- Uses conditional logic based on `location.hostname` for site-specific behavior

### Module Structure
- **`src/utils/`**: Utility modules (e.g., `greeter.ts`)
- **`src/global.d.ts`**: TypeScript declarations
- **`tests/`**: Vitest unit tests

### Userscript Deployment
The build script supports automatic deployment via `USERSCRIPT_OUT_DIR` environment variable:
```bash
USERSCRIPT_OUT_DIR="/path/to/userscripts" npm run build
```

## Testing Framework
- **Vitest**: Unit testing framework with TypeScript support
- Tests located in `tests/` directory
- Global test functions (`describe`, `it`, `expect`) configured in `tsconfig.json`

## Code Quality
- **ESLint**: Linting with TypeScript and import rules
- **Prettier**: Code formatting
- **EditorConfig**: Consistent editor settings
- **GitHub Actions**: CI pipeline runs lint, test, and build on push/PR

## VS Code Integration
Pre-configured with:
- Recommended extensions (Prettier, ESLint, Code Spell Checker)
- Build tasks accessible via Command Palette
- Optimized settings for TypeScript development
