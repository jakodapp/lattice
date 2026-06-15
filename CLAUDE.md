# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Lattice Context Manager is a VSCode extension that provides a visual dashboard to manage `.claude/` configurations (skills, commands, agents, rules, docs, CLAUDE.md) across multiple repositories. It scans configurable root directories, detects duplicates via SHA-256 content hashing, and enables drag-and-drop operations between repos through a Lit-powered webview with a masonry kanban layout.

## Commands

- `npm run build` — Build both extension and webview bundles with esbuild
- `npm run watch` — Watch mode for development
- `npm run lint` — Type-check with TypeScript (`tsc --noEmit`)
- `npx @vscode/vsce package` — Package as .vsix for local install

## Architecture

```
src/
├── extension.ts              ← Entry point: activates views, commands, dashboard
├── types.ts                  ← Core interfaces: Repo, Asset, AssetType, SyncStatus
├── services/
│   ├── scanner.ts            ← Scans root dirs, discovers repos, enumerates assets
│   ├── fs-utils.ts           ← Shared symlink-aware helpers (isDirEntry, isFileEntry)
│   ├── hasher.ts             ← SHA-256 content hashing (files and directories)
│   ├── sync-detector.ts      ← Groups assets by name, compares hashes
│   ├── file-ops.ts           ← Copy, move, delete operations
│   └── watcher.ts            ← FileSystemWatcher with debounced refresh
├── views/                    ← TreeDataProviders for sidebar tree views
├── commands/                 ← Command handlers (copy, move, delete, diff, bulk ops)
├── providers/
│   └── dashboard-panel.ts    ← WebviewPanel provider, message handler
└── webview/                  ← Lit web components (browser bundle)
    ├── index.ts              ← Webview entry point
    ├── types.ts              ← Serializable types for extension↔webview messages
    ├── styles.ts             ← Global CSS variables
    └── components/
        ├── dashboard-app.ts  ← Root component, toolbar, event routing
        ├── kanban-board.ts   ← Masonry grid layout, drop menu orchestration
        ├── kanban-column.ts  ← Single column with drop zone
        ├── asset-chip.ts     ← Draggable asset with type colors
        ├── view-toggle.ts    ← By Repository / By Type switch
        ├── search-bar.ts     ← Filter input
        ├── detail-panel.ts   ← Slide-over: repo details + asset preview
        └── drop-menu.ts      ← Floating context menu on drop
```

## Two Build Targets

The project produces **two separate bundles** via esbuild:

1. **Extension** (`dist/extension.js`) — Node.js, CommonJS, `vscode` external
2. **Webview** (`dist/webview.js`) — Browser, ESM, includes Lit

Both are configured in `esbuild.config.mjs`. Changes to `src/webview/` only affect the webview bundle. Changes to other `src/` files only affect the extension bundle. `src/webview/types.ts` defines the message protocol shared between them.

## Key Patterns

- **Extension ↔ Webview communication** uses `postMessage` / `onDidReceiveMessage` with typed message unions (`ToWebview` / `ToExtension` in `src/webview/types.ts`)
- **Asset types**: skill (directory), command, agent, rule, doc, output-style, settings, claude-md
- **Skills are directories** (with SKILL.md + supporting files), everything else is single files
- **Sync detection**: SHA-256 hash comparison — same name+type across repos = group, identical hashes = synced, different = diverged
- **Lit decorators** require `experimentalDecorators: true` and `useDefineForClassFields: false` in tsconfig

## Rules

- Always type-check before building: `./node_modules/.bin/tsc --noEmit`
- Never import `vscode` in webview code — it's only available in the extension context
- Asset colors are defined per-type using HSL with consistent saturation/lightness
- The webview uses VSCode CSS variables (`--vscode-*`) for theme compatibility
- Design context files (PRODUCT.md, DESIGN.md) live in `.claude/docs/`, not the project root. Any skill, command, or agent that needs these files should check `.claude/docs/` if they're not found at the root path.

## Reference Docs

| Doc | When to read |
|-----|-------------|
| `.claude/skills/audit/` | When auditing code quality or reviewing a PR |
| `.claude/commands/generate-docs.md` | When generating or updating project documentation |
| `.claude/docs/01-architecture.md` | When understanding the stack, build system, or project structure |
| `.claude/docs/02-data-model.md` | When working with types, message protocol, or adding new asset types |
| `.claude/docs/03-services.md` | When modifying scanner, hasher, sync detection, or file operations |
| `.claude/docs/04-views.md` | When changing dashboard views, detail panel, or activation flow |
| `.claude/docs/05-ui-components.md` | When modifying or adding Lit webview components |
| `.claude/docs/06-agent-config-conventions.md` | When working with the agent registry, multi-tool detection, or cross-tool export/format conversion |
| `.claude/docs/08-demo-recordings.md` | When writing demo scenarios, debugging the recording pipeline, or understanding the Playwright + CDP + screencapture architecture |
| `.claude/docs/09-design-system.md` | When working with PRODUCT.md, DESIGN.md, or .impeccable/design.json — understanding the design context layer, token structure, or named rules |
