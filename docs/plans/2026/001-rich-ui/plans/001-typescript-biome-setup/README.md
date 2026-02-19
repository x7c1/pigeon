# TypeScript + Biome Setup

Status: Draft

## Overview

Migrate the Chrome extension codebase (`chrome-extension/`) from JavaScript to TypeScript and introduce Biome as the linter/formatter.

## Background

The current `chrome-extension/` directory contains plain JavaScript (3 files: `background.js`, `content.js`, `popup.js`) with no type checking or linting. This plan establishes the development foundation ahead of upcoming UI work.

## Scope

- Migrate JS files under `chrome-extension/` to TypeScript
- Introduce Biome for linting and formatting
- Set up a build pipeline (TS → JS transpilation)
- Add Chrome Extension API type definitions

## Tasks

- Create `package.json` in `chrome-extension/`
- Add TypeScript and Biome as devDependencies
- Configure `tsconfig.json` for Chrome Extension development
- Create Biome configuration (`biome.json`)
- Rename `.js` files to `.ts` and add type annotations
- Add Chrome Extension API type definitions
- Add build scripts to `package.json`
- Add build targets to Makefile
- Verify existing functionality is preserved

## Out of Scope

- Server-side (Rust) changes
- UI feature additions (addressed in 002)

## Estimates

- 3 points
