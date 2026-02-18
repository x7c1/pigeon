# TypeScript + Biome Setup

Status: Completed

## Overview

Migrate the Chrome extension codebase (`chrome-extension/`) from JavaScript to TypeScript and introduce Biome as the linter/formatter.

## Background

The current `chrome-extension/` directory contains plain JavaScript (3 files: `background.js`, `content.js`, `popup.js`) with no type checking or linting. This plan establishes the development foundation ahead of upcoming UI work.

## Scope

- Migrate JS files under `chrome-extension/` to TypeScript
- Introduce Biome for linting and formatting
- Set up a build pipeline using esbuild (TS → single-file JS bundles per entry point)
- Add Chrome Extension API type definitions
- Output build artifacts to `dist/` (JS bundles + static files like manifest.json, icons)
- Users will load `dist/` as the unpacked extension in Chrome

## Tasks

- Create `package.json` in `chrome-extension/`
- Add TypeScript, esbuild, and Biome as devDependencies
- Configure `tsconfig.json` for Chrome Extension development
- Create Biome configuration (`biome.json`)
- Rename `.js` files to `.ts` and add type annotations
- Add Chrome Extension API type definitions
- Set up esbuild to bundle each entry point (background.ts, content.ts, popup.ts) into `dist/`
- Copy static files (manifest.json, icons, popup.html) to `dist/` as part of the build
- Update manifest.json paths if needed for `dist/` output structure
- Add `.gitignore` entries for `node_modules/` and `dist/`
- Add build scripts to `package.json`
- Add build targets to Makefile
- Update README with new setup instructions (install deps, build, load `dist/` in Chrome)
- Verify existing functionality is preserved

## Out of Scope

- Server-side (Rust) changes
- UI feature additions (addressed in 002)

## Estimates

- 3 points
