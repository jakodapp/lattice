# Lattice Context Manager — Architecture

> Updated: 2026-05-15

> A VSCode extension that scans configurable root directories for repositories containing `.claude/` folders, presents them in a Lit-powered webview dashboard with dual views (kanban repo grid + asset card list), and enables drag-and-drop copy/move/replace operations between repos with SHA-256 content hashing for sync detection. Supports symlink-based sharing via a canonical `~/.assets` directory, multi-agent detection (Claude, Cursor, Cline, Windsurf, Codex, Continue, Roo, Copilot), and a repo picker modal for bulk operations. Activates on startup via status bar button.

---

## 1. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | VSCode Extension API 1.85+ | Commands, webview panels, file system watchers, status bar |
| Runtime | Node.js 18+ (CLI) | CLI companion using same pure services |
| Language | TypeScript 5.3+ (strict mode) | Type safety across all three bundles |
| Webview UI | Lit 3.x (web components) | Reactive components with decorators, Shadow DOM encapsulation |
| Bundler | esbuild | Produces three bundles: extension (CJS), webview (ESM), CLI (CJS+shebang) |
| Hashing | Node.js `crypto` (SHA-256) | Content-based sync detection across repos |
| Metadata | `context.json` + git versioning | Asset tracking and operation history at `~/.assets/.lattice/` |
| Icons | `lucide-static` | SVG icons for webview (replaced custom SVGs) |
| Testing | `node:test` + tsx | Built-in Node test runner with TypeScript loader |

---

## 2. Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Triple-bundle architecture | Extension (CJS) + Webview (ESM) + CLI (CJS+shebang) | Extension for VSCode, webview for browser iframe, CLI for terminal/CI |
| Service purification | No `vscode` imports in services (except watcher.ts) | Enables CLI to call same services. `vscode-adapter.ts` bridges extension to services |
| Context versioning | `context.json` + git auto-commit at `~/.assets/.lattice/` | Every operation tracked with commit history for audit trail |
| UI framework | Lit web components | Lightweight (~5KB), used by VSCode's own toolkit, decorator-based reactivity |
| Sync detection | SHA-256 content hashing | Deterministic comparison without git dependency; works for both files and directories |
| Layout | CSS Grid masonry (`auto-fill`) | Responsive columns that adapt to panel width; vertical scroll |
| Drag-and-drop | Native HTML5 DnD API | No extra dependencies; sufficient for card-to-column drops |
| Drop action menu | Floating context menu at cursor | Copy/Replace for local assets, Install for canonical/symlink assets |
| Communication | `postMessage` with discriminated unions | Type-safe extension↔webview protocol via `ToWebview` / `ToExtension` unions |
| Path resolution | Pure function in separate module | Extracted to `path-resolver.ts` for testability without `vscode` dependency |
| Error handling | `CcmError` typed error class | Domain error codes (`COPY_FAILED`, `PATH_OUTSIDE_ROOTS`, `SYMLINK_FAILED`, etc.) with context |
| State caching | `ConfigStore` with pre-computed `assetGroups` | Avoids recomputing `buildAssetGroups` on every render |
| Activation | `onStartupFinished` + status bar | No sidebar; dashboard opens via status bar click |
| Preview extraction | Pure function in `preview-extractor.ts` | Extracts description from YAML frontmatter, blockquotes, or paragraphs without vscode dependency |
| Resizable panel | Drag handle + split-view at 700px | Email-client layout: file list left, preview right when expanded |
| Asset sharing | Hybrid symlink + copy via `symlink-ops.ts` | Symlinks for canonical assets, copy fallback if symlinks fail. Dynamic import avoids vscode dependency in tests |
| Multi-agent detection | Lightweight registry in `agent-registry.ts` | Detects 8 AI agent config dirs per repo without external deps |
| Canonical path | Configurable `~/.assets` directory | Shared asset library; assets here can be symlinked to any repo |
| Asset operations | Extracted to `asset-operations.ts` | Pure/testable functions for delete warnings, copy/move/install/delete canonical |

---

## 3. Project Structure

```
project-root/
├── src/
│   ├── extension.ts                  ← Activation, command registration, ConfigStore, context store init
│   ├── vscode-adapter.ts             ← readVscodeConfig(), showResult() — VSCode bridge
│   ├── types.ts                      ← Repo, Asset, AssetGroup, AssetType (10 types), constants
│   ├── constants.ts                  ← File name constants, display helpers (displayHash, truncatePreview, getErrorMessage)
│   ├── errors.ts                     ← CcmError typed error class (11 error codes)
│   ├── services/                     ← Pure Node.js — NO vscode imports (except watcher.ts)
│   │   ├── config.ts                ← LatticeConfig interface, defaults, expandHome utility
│   │   ├── result.ts                ← OperationResult<T> type
│   │   ├── scanner.ts                ← Recursive dir walk, accepts LatticeConfig via constructor
│   │   ├── asset-enumerator.ts      ← Shared directory walker (used by scanner + github-import)
│   │   ├── hasher.ts                 ← SHA-256 for files and directories
│   │   ├── sync-detector.ts          ← Group assets by name, compare hashes
│   │   ├── preview-extractor.ts      ← Pure function: extractPreview
│   │   ├── path-resolver.ts          ← Pure function: getTargetPath
│   │   ├── file-ops.ts              ← Copy, move, delete — returns OperationResult
│   │   ├── fs-utils.ts              ← Shared symlink-aware helpers (isDirEntry, isFileEntry, isSymlinkToDir)
│   │   ├── symlink-ops.ts           ← Symlink creation, installAsset (auto copy/symlink based on source)
│   │   ├── asset-operations.ts      ← copy/move/install/delete — returns OperationResult
│   │   ├── context-store.ts         ← ContextStore class, context.json schema, merge logic
│   │   ├── lattice-git.ts           ← LatticeGit class, auto-commit for context versioning
│   │   ├── git-ops.ts               ← GitHub clone, cleanup, getHeadCommit
│   │   ├── github-import.ts         ← discoverAssets, installDiscoveredAssets
│   │   ├── agent-registry.ts        ← 8-agent registry, detectAgentsInRepo
│   │   └── watcher.ts               ← FileSystemWatcher with 2s debounce, scoped to current repo (only vscode dep)
│   ├── cli/                          ← CLI companion (same services, terminal I/O)
│   │   ├── index.ts                  ← Entry point, arg parsing, command dispatch
│   │   ├── cli-config.ts            ← Load/save config from ~/.assets/.lattice/config.json
│   │   ├── output.ts                ← Terminal formatting (colors, tables)
│   │   └── commands/
│   │       ├── scan.ts              ← lattice scan
│   │       ├── status.ts            ← lattice status
│   │       ├── list.ts              ← lattice list [--repo <name>]
│   │       ├── diff.ts              ← lattice diff <asset>
│   │       ├── copy.ts              ← lattice copy <asset> --to <repos>
│   │       ├── move.ts              ← lattice move <asset> --to <repo>
│   │       ├── install.ts           ← lattice install <asset> --to <repos>
│   │       ├── sync.ts              ← lattice sync [asset]
│   │       ├── remove.ts            ← lattice remove <repo> [asset]
│   │       └── agents.ts            ← lattice agents
│   ├── views/
│   │   ├── tree-items.ts            ← TreeItem builders with VSCode ThemeIcons
│   │   ├── by-repo-provider.ts      ← TreeDataProvider for repo-grouped view
│   │   └── by-type-provider.ts      ← TreeDataProvider for type-grouped view
│   ├── commands/                     ← VSCode command handlers (QuickPicks, confirmations)
│   ├── providers/
│   │   └── dashboard-panel.ts       ← WebviewPanel singleton, uses showResult() + _trackChange()
│   └── webview/                      ← Lit web components (browser bundle)
│       ├── index.ts
│       ├── types.ts
│       ├── styles.ts
│       ├── icons.ts                  ← Lucide icon exports (12 icons)
│       └── components/               ← dashboard-app, kanban-board, detail-panel, asset-picker, version-picker, context-menu, etc.
├── test/
│   ├── hasher.test.ts               ← 5 tests
│   ├── sync-detector.test.ts        ← 9 tests
│   ├── file-ops.test.ts             ← 9 tests
│   ├── extract-preview.test.ts      ← 11 tests
│   ├── symlink-ops.test.ts          ← 8 tests
│   ├── agent-registry.test.ts       ← 8 tests
│   ├── git-ops.test.ts              ← 25 tests
│   ├── context-store.test.ts        ← 16 tests (new)
│   ├── asset-operations.test.ts     ← 10 tests (new)
│   ├── asset-enumerator.test.ts     ← 7 tests (new)
│   ├── lattice-git.test.ts          ← 6 tests (new)
│   ├── config.test.ts               ← 3 tests (new)
│   └── cli-e2e.test.ts              ← CLI lifecycle E2E tests
├── dist/
│   ├── extension.js                  ← CJS bundle (extension)
│   ├── webview.js                    ← ESM bundle (webview, includes Lit)
│   └── cli.js                        ← CJS bundle with shebang (CLI)
├── resources/
│   └── logo.png                      ← Extension icon (tab + marketplace)
├── package.json                      ← Extension manifest, contributes, configuration
├── tsconfig.json                     ← Strict, experimentalDecorators, useDefineForClassFields: false
├── esbuild.config.mjs               ← Triple-target build config
└── CLAUDE.md                         ← Project instructions for Claude Code
```

---

## 4. Triple-Bundle Build

The `esbuild.config.mjs` produces three independent bundles:

| Bundle | Entry | Format | Platform | Target | Externals |
|---|---|---|---|---|---|
| Extension | `src/extension.ts` | CJS | Node 18 | node18 | `vscode` |
| Webview | `src/webview/index.ts` | ESM | Browser | es2022 | — |
| CLI | `src/cli/index.ts` | CJS + shebang | Node 18 | node18 | `vscode` |

The webview bundle includes Lit and all components. The extension bundle excludes `vscode` (provided at runtime). The CLI bundle adds a `#!/usr/bin/env node` shebang and injects `__PKG_VERSION__` from package.json via esbuild `define`. Source maps are only generated in watch mode (`sourcemap: isWatch`). Minification is enabled for production builds.

---

## 5. Import Conventions

- Extension code imports `vscode` as external — never imported in webview code
- Webview types (`SerializedAsset`, `SerializedRepo`, `ToWebview`, `ToExtension`) defined in `src/webview/types.ts`
- Extension types (`Repo`, `Asset`, `AssetGroup`) defined in `src/types.ts`
- The `ConfigStore` interface is exported from `extension.ts` and imported via `import type` in consumers
- `path-resolver.ts`, `preview-extractor.ts`, `agent-registry.ts` have no `vscode` dependency — testable directly
- `symlink-ops.ts` uses dynamic `await import('./file-ops')` to avoid static `vscode` dependency — enables testing with injectable `copyFn`

---

## 6. Build & Dev Commands

| Command | Purpose |
|---|---|
| `npm run build` | Build all three bundles (extension, webview, CLI) |
| `npm run watch` | Watch mode (all bundles, with source maps) |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm test` | Run all tests via `node --import tsx --test` |
| `npm run test:unit` | Run unit tests only (skips CLI E2E) |
| `npm run test:e2e` | Run CLI E2E tests only |
| `npm run package` | Package as `.vsix` via `vsce package` |

---

## 7. Configuration

The extension exposes five settings under `latticeContextManager.*`:

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `roots` | `string[]` | `[]` | Root directories to scan (e.g. `["~/Workplace"]`) |
| `globalPaths` | `string[]` | `["~/.claude", "~/.cursor", "~/.github"]` | Global agent config directories to include |
| `canonicalPaths` | `string[]` | `["~/.assets", "~/.agents"]` | Canonical directories for shared assets (first is primary) |
| `maxDepth` | `number` | `4` | Max recursion depth when scanning |
| `ignoreDirs` | `string[]` | `["node_modules", ".git", "dist", ...]` | Directory names to skip |

Install mode is automatic: assets from canonical paths are symlinked, everything else is copied.

---

## Related Documents

- [Data Model](02-data-model.md) — All types and message protocol
- [Services](03-services.md) — Scanner, hasher, sync-detector, file-ops, symlink-ops, agent-registry
- [Views & Screens](04-views.md) — Tree views and webview dashboard
- [UI Components](05-ui-components.md) — Lit component inventory

## File References

| File | Role |
|---|---|
| `package.json` | Extension manifest, dependencies, scripts, contributes, 6 settings |
| `tsconfig.json` | TypeScript configuration, decorator settings |
| `esbuild.config.mjs` | Triple-bundle build config (source maps only in watch mode, `__PKG_VERSION__` define) |
| `src/extension.ts` | Activation, ConfigStore, status bar, command registration |
| `src/constants.ts` | File name constants, display helpers |
| `src/errors.ts` | CcmError class definition with 11 error codes |
| `resources/logo.png` | Extension icon (tab + marketplace) |
| `src/services/preview-extractor.ts` | Pure extractPreview function |
| `src/services/symlink-ops.ts` | Symlink creation, detection, installAsset |
| `src/services/agent-registry.ts` | 8-agent registry, detectAgentsInRepo |
| `src/services/asset-operations.ts` | Pure functions for canonical operations and delete warnings |
