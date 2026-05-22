# Services & Business Logic

> Updated: 2026-05-22

> Fourteen service modules handle scanning, hashing, sync detection, path resolution, file operations, symlink operations, asset operations, agent detection, file watching, preview extraction, configuration, asset enumeration, context tracking, and git versioning. All services are pure Node.js — no `vscode` imports — enabling use from both the VSCode extension and the CLI. The only exception is `watcher.ts`, which is VSCode-specific by nature. A thin adapter layer (`vscode-adapter.ts`) bridges services to VSCode APIs. Shared constants (`src/constants.ts`) provide `CONTEXT_DIRS` (directories that identify managed repos) and `HIDDEN_ASSET_TYPES` (asset types excluded from user-facing counts).

---

## Config (`src/services/config.ts`)

Defines the `LatticeConfig` interface and defaults. Both the VSCode extension (via `vscode-adapter.ts`) and CLI (via `cli-config.ts`) produce this same shape.

### `LatticeConfig`

```typescript
interface LatticeConfig {
  roots: string[];              // Workspace roots to scan
  canonicalPaths: string[];     // Default ['~/.assets', '~/.agents']
  globalPaths: string[];        // Default ['~/.claude', '~/.cursor', '~/.github']
  maxDepth: number;             // Default 4
  ignoreDirs: string[];         // node_modules, .git, dist, etc.
  hiddenRepos: string[];        // Absolute paths of repos hidden from dashboard
}
```

`hiddenRepos` is a **lattice-managed field** — it is persisted in `~/.assets/.lattice/config.json` and never read from VSCode settings. The `saveCliConfig` merge logic preserves it across extension restarts (see CLI Config section).

### `expandHome(p: string): string`

Shared utility — expands `~` to `process.env.HOME`. Used by scanner, symlink-ops, and CLI config loader. Single source of truth (previously duplicated 3x).

---

## Result (`src/services/result.ts`)

### `OperationResult<T>`

```typescript
interface OperationResult<T = void> {
  ok: boolean;
  data?: T;
  message: string;
  errors?: Array<{ target: string; error: string }>;
}
```

Returned by all service functions that previously called `vscode.window`. The caller (extension or CLI) decides how to present the result.

---

## Scanner (`src/services/scanner.ts`)

### `Scanner` class

Accepts `LatticeConfig` via constructor (no `vscode` dependency). Walks directories, discovers repos, and enumerates assets. Builds "Global" repos from `globalPaths` and "Canonical" repos from `canonicalPaths`. Uses symlink-aware helpers from `fs-utils.ts` for all `Dirent` checks.

### `scan(): Promise<Repo[]>`

Entry point. Reads `config.roots`, scans each recursively. Prepends global and canonical repos.

- **Returns:** Sorted array of `Repo` objects (canonical first, then global, then project repos alphabetically)
- **Edge cases:** Logs unreadable roots via `console.debug`. Stops recursion at `maxDepth`

### `buildGlobalRepos(): Promise<Repo[]>`

Iterates `config.globalPaths` (default `['~/.claude', '~/.cursor', '~/.github']`). Creates a repo with `isGlobal: true` for each path that exists and has assets. Empty array disables global scanning.

### `buildCanonicalRepos(): Promise<Repo[]>`

Iterates `config.canonicalPaths` (default `['~/.assets', '~/.agents']`). Creates a repo with `isCanonical: true` for each path that exists and has assets. First path is primary (used for `.lattice/` tracking and convert-to-symlink destination).

### `discoverGitRepos(): Promise<Array<{ name: string; path: string }>>`

Walks the same roots at the same `maxDepth`, but finds directories with `.git` but **no** context folder (`.claude`, `.github`, `.cursor`). Used by the "Can't find your repository?" discovery modal. Returns repo name (relative to root) and absolute path.

### `scanDirectory(dirPath, depth, repos): Promise<void>`

Recursive walker. Requires **both** a context directory (from `CONTEXT_DIRS`: `.claude`, `.github`, `.cursor`) **and** `.git/` to recognize a directory as a repo. This prevents false positives from bare `.claude/` folders created by tools like Claude Code's auto-memory. Recurses in parallel via `Promise.all`.

### `enumerateAssets(repo): Promise<Asset[]>`

Walks `.claude/` contents:

| Entry | Handling |
|---|---|
| `skills/`, `commands/`, `agents/`, `rules/`, `scripts/`, `hooks/`, `output-styles/` | Dispatched to `enumerateAssetDir()` |
| `settings.json`, `settings.local.json` | Added as `'settings'` type |
| `*.mcp.json`, `mcp_servers.json` | Added as `'mcp-config'` type |
| `CLAUDE.md` inside `.claude/` | Added as `'claude-md'` |
| `CLAUDE.md` at repo root | Added as `'claude-md'` |

### `enumerateAssetDir(dirPath, assetType, repoName): Promise<Asset[]>`

Uses the shared `asset-enumerator.ts` for directory walking, then enriches each item with hash (via `hashFile`/`hashDirectory`) and symlink detection.

---

## Asset Enumerator (`src/services/asset-enumerator.ts`)

Shared directory walker used by both `scanner.ts` and `github-import.ts`. Eliminates ~60 lines of duplicated discovery logic.

### `enumerateAssetDir(dirPath, assetType): Promise<EnumeratedItem[]>`

Walks an asset-type directory and yields raw items:

- **Skills:** Each subdirectory is one asset (`isDirectory: true`)
- **Non-skill dirs:** Recurse into them (e.g. `rules/security/xss.md`)
- **Files:** `.md` and `.js` files, name derived by stripping extension
- **Filters:** Skips hidden files (`.DS_Store`), `Thumbs.db`
- **Symlinks:** Resolves symlinks to directories via `fs.stat`

### `EnumeratedItem`

```typescript
interface EnumeratedItem {
  name: string;
  type: AssetType;
  fullPath: string;
  isDirectory: boolean;
}
```

Callers enrich with hashing (scanner) or preview reading (github-import).

---

## Hasher (`src/services/hasher.ts`)

### `hashFile(filePath): Promise<string>`

SHA-256 hash of a single file's raw contents. Returns 64-character hex string.

### `hashDirectory(dirPath): Promise<string>`

SHA-256 hash of an entire directory's contents. Sorts all files by relative path, concatenates `"relativePath:hash"` for each, then hashes the result.

---

## Sync Detector (`src/services/sync-detector.ts`)

### `buildAssetGroups(allAssets): AssetGroup[]`

Groups all assets by `"type::name"` key. For each group with 2+ instances, compares hashes:

- All hashes identical → `'synced'`
- Any hash differs → `'diverged'`

### `getInstanceStatus(asset, group): SyncStatus`

Determines a single asset's status within its group: `'unique'`, `'synced'`, or `'modified'`.

---

## Path Resolver (`src/services/path-resolver.ts`)

### `getTargetPath(asset, targetRepo): string`

Pure function. Computes destination path when copying an asset to a target repo. Maps asset type → `.claude/<type-dir>/`.

---

## File Operations (`src/services/file-ops.ts`)

No `vscode` imports. Pure file system operations.

### `copyAsset(asset, targetRepo): Promise<string>`

Copies asset to target repo. Uses `fs.cp` (recursive) for directories, `fs.copyFile` for files. Throws `CcmError('COPY_FAILED')`.

### `moveAsset(asset, targetRepo): Promise<string>`

Calls `copyAsset` then `deleteAsset`. Not atomic.

### `deleteAsset(asset): Promise<void>`

Removes asset from disk. Throws `CcmError('DELETE_FAILED')`.

### `copyAssetToMany(asset, targetRepos): Promise<OperationResult<{ successCount: number }>>`

Copies to multiple repos via `Promise.allSettled`. Returns `OperationResult` with success count and per-repo errors.

---

## Symlink Operations (`src/services/symlink-ops.ts`)

No `vscode` imports. The circular dependency with `file-ops.ts` was eliminated — `installAsset` now requires an explicit `copyFn` parameter instead of using dynamic `import()`.

### `isCanonicalPath(assetPath, canonicalBases: string | string[]): boolean`

Checks if a path is within any of the configured canonical directories.

### `isCanonicalSymlink(targetPath, canonicalPath): Promise<boolean>`

Checks if a target is a symlink pointing to the expected canonical location.

### `createRelativeSymlink(targetPath, linkPath): Promise<boolean>`

Creates a relative symlink. Uses `'junction'` on Windows. Idempotent.

### `installAsset(asset, targetRepo, options): Promise<InstallResult>`

Main install function. **Requires `copyFn` in options.** Install strategy is automatic — no `mode` parameter:

1. Resolve canonical source (`asset.canonicalPath ?? asset.path`)
2. If source is in any canonical directory → create symlink
3. Otherwise → copy the files
4. If target already has correct symlink → return early
5. If symlink creation fails → fallback to copy
6. If both fail → throw `CcmError('SYMLINK_FAILED')`

---

## Asset Operations (`src/services/asset-operations.ts`)

No `vscode` imports. All functions return `OperationResult` instead of showing UI messages.

### `getDeleteWarning(opts): DeleteWarning`

Pure function. Computes context-aware delete warning message.

### `installToMultipleRepos(asset, repos, options, verb): Promise<OperationResult>`

Private shared function. Installs an asset to multiple repos, collecting successes and errors. Used by both `copyAssetToRepos` and `installCanonicalToRepos`.

### `copyAssetToRepos(asset, targetRepos, options): Promise<OperationResult<{ successCount }>>`

Delegates to `installToMultipleRepos` with verb `'copy'`.

### `moveAssetToRepo(asset, targetRepo, options): Promise<OperationResult>`

Installs to target, deletes source.

### `installCanonicalToRepos(asset, targetRepos, canonicalBase): Promise<OperationResult<{ successCount }>>`

Delegates to `installToMultipleRepos`. Symlink behavior is automatic since the source is in a canonical directory.

### `findAffectedSymlinks(asset, allRepos): string[]`

Pure function. Returns repo names that have symlinks pointing to the given canonical asset.

### `deleteCanonicalAsset(asset, allRepos): Promise<OperationResult>`

Removes symlinks first (best effort), then deletes the canonical asset. Caller handles confirmation UI.

---

## Context Store (`src/services/context-store.ts`)

Tracks **every asset** across all repos in `~/.assets/.lattice/context.json`. Updated on every operation from both extension and CLI.

### Schema

```typescript
interface ContextFile {
  version: 1;
  updatedAt: string;          // ISO 8601
  assets: ContextAsset[];
}

interface ContextAsset {
  name: string;
  type: AssetType;
  canonicalHash: string;
  modifiedAt: string;
  installations: ContextInstallation[];
  source?: ContextSource;     // GitHub-imported assets only
}

interface ContextInstallation {
  repoPath: string;
  repoName: string;
  mode: 'copy' | 'symlink';
  hash: string;
  synced: boolean;
}

interface ContextSource {
  url: string;
  commitHash: string;
  ref: string;
  subpath?: string;
  fetchedAt: string;
}
```

### `ContextStore` class

- **`load()`** — Reads `context.json`, or creates empty context
- **`save()`** — Writes atomically (tmp + rename). Returns `false` if nothing changed (via `contentSnapshot()` comparison)
- **`trackAsset(asset)`** — Upsert by name + type
- **`untrackAsset(name, type)`** — Remove
- **`updateInstallation(name, type, installation)`** — Upsert installation by repoPath
- **`removeInstallation(name, type, repoPath)`** — Remove installation
- **`buildFromScan(repos, canonicalPath)`** — Merge scan results into existing context
- **`getGitHubAssets()`** — Filter assets with `source` metadata

### `buildFromScan` — Merge Logic

Uses extracted helpers for decomposition:

1. **`indexCanonicalAssets(repos)`** — Indexes canonical repo assets by `type::name` key
2. **`collectScannedInstallations(repos, canonical)`** — Groups installations from scanned repos
3. **`mergeInstallations(existing, fresh, scannedPaths, hasCanonical)`** — Merges preserved (unscanned) + fresh installations, sorted by `repoPath`
4. **`parseAssetKey(key)`** — Parses `type::name` key with runtime `AssetType` validation
5. **`installationsEqual(a, b)`** — Deep compares installation arrays (order-independent)

**Key behavior:** Only updates assets found in the current scan. Preserves installations from repos not included in this scan (different roots, different source). `modifiedAt` only changes when `canonicalHash` or installations actually differ.

---

## Lattice Git (`src/services/lattice-git.ts`)

Git operations for the `~/.assets/.lattice/` version history.

### `LatticeGit` class

- **`ensureRepo()`** — Creates directory, `git init`, adds `.gitignore`, initial commit. Idempotent.
- **`commit(message)`** — Stages `context.json` + `config.json`, checks for changes, commits. No-op if nothing changed.
- **`log(count?)`** — Returns recent commit entries (`hash`, `message`, `date`).

---

## GitHub Import (`src/services/github-import.ts`)

### `discoverAssets(clonedRepoPath): Promise<DiscoveredAsset[]>`

Discovers assets in a cloned repo. Scans `.claude/` first, falls back to root scan for repos that ARE a context folder.

Uses shared `asset-enumerator.ts` for directory walking, enriches with preview text.

### `installDiscoveredAssets(assets, targetRepos, options): Promise<number>`

Installs selected discovered assets to target repos. Returns success count.

---

## Git Operations (`src/services/git-ops.ts`)

### `parseGitHubUrl(url): ParsedGitHubUrl | undefined`

Parses GitHub URLs (shorthand `owner/repo`, HTTPS with `/tree/` or `/blob/` paths, SSH). Strips `SKILL.md` from blob URL subpaths so the skill directory is targeted.

### `shallowClone(url, branch?): Promise<CloneResult>`

Shallow-clones a GitHub repo to a temp directory. 60s timeout.

### `cleanupClone(localPath): Promise<void>`

Safely removes a cloned temp directory (only if path is in `os.tmpdir()`).

### `getHeadCommit(repoPath): Promise<string>`

Returns the HEAD commit hash from a local git repo. Used to capture commit hash during GitHub imports.

---

## Agent Registry (`src/services/agent-registry.ts`)

### `AGENT_REGISTRY: AgentDef[]`

8 supported AI agents with config dirs and global dirs.

### `detectAgentsInRepo(repoPath): Promise<string[]>`

Checks for each agent's config dir.

---

## Preview Extractor (`src/services/preview-extractor.ts`)

### `extractPreview(raw: string): string`

Pure function. Extracts description from YAML frontmatter, blockquotes, or paragraphs.

---

## Watcher (`src/services/watcher.ts`)

The **only** service with a `vscode` import. Watches `.claude/**/*` in the current workspace repo only. 2-second debounce.

### Design

The watcher **only monitors the current workspace's `.claude/` directory** — not global (`~/.claude/`), canonical (`~/.assets/`), or other discovered repos. This prevents Claude Code's frequent writes to `~/.claude/` (projects, memory, todos, etc.) and the context store's writes to `~/.assets/.lattice/` from triggering continuous scan loops. Other repos are scanned on-demand (dashboard open, manual refresh, config change).

### Watcher Reconciliation

`watchRepos()` uses a `Map<claudePath, WatcherEntry>` to diff incoming repos against existing watchers. Only new repos get watchers; stale repos get disposed. Existing watchers are kept alive across refreshes — no tear-down/recreate cycle.

### Path Exclusion

Event handlers check changed URIs against exclude sets before triggering a refresh:

- **Global repos (`~/.claude/`)**: Ignores `projects/`, `memory/`, `todos/`, `statsig/`, `conversations/`, `.credentials/`, `analytics/`, `tune/`, `ide/`
- **Canonical repos (`~/.assets/`)**: Ignores `.lattice/`, `.git/`

This is defensive — in normal operation, only the current workspace repo is watched, so these exclusions don't fire. They protect against edge cases where a workspace IS at `~/.claude/` or `~/.assets/`.

### Re-entrancy Guard (`src/extension.ts`)

The `refresh()` function in `extension.ts` uses a `refreshRunning`/`refreshQueued` flag pair:

- If a refresh is in progress, new triggers set `refreshQueued = true` and return immediately
- After the current refresh completes, if `refreshQueued` is set, one trailing refresh fires
- This coalesces any number of rapid file changes into at most one pending scan

### Status Bar

The status bar shows only user-facing assets from the current workspace repo, filtering out `HIDDEN_ASSET_TYPES` (`settings`, `claude-md`, `mcp-config`).

### `ensureLatticeStore` (Startup)

Called once after the initial scan. Persists VSCode-owned settings to `~/.assets/.lattice/config.json` so the CLI stays in sync. Loads the existing config first and only overlays VSCode-owned fields — `hiddenRepos` and other lattice-managed fields are never overwritten. Also rebuilds `context.json` and commits if changed.

---

## VSCode Adapter (`src/vscode-adapter.ts`)

Thin bridge between pure services and VSCode APIs.

### `readVscodeConfig(): LatticeConfig`

Reads `vscode.workspace.getConfiguration('latticeContextManager')` and returns a `LatticeConfig` object. Sets `hiddenRepos` to the default (empty array) — this field is managed by the lattice config file, not VSCode settings.

### `showResult(result: OperationResult): void`

Shows `vscode.window.showInformationMessage` or `showErrorMessage` based on `result.ok`.

---

## CLI (`src/cli/`)

The CLI (`lattice`) provides terminal access to the same pure services used by the extension. Version is injected from `package.json` at build time via esbuild's `define` (`__PKG_VERSION__`).

### Entry Point (`src/cli/index.ts`)

Dispatches commands to handler functions. Config loaded from `~/.assets/.lattice/config.json`.

### Commands

| Command | File | Description |
|---|---|---|
| `scan` | `commands/scan.ts` | Discover repos and assets, populate context store |
| `status` | `commands/status.ts` | Show sync status across repos |
| `list` | `commands/list.ts` | List assets (optionally filtered by `--repo`) |
| `diff` | `commands/diff.ts` | Diff asset versions across repos |
| `copy` | `commands/copy.ts` | Copy asset to target repos (`--to`) |
| `move` | `commands/move.ts` | Move asset to target repo (`--to`) |
| `install` | `commands/install.ts` | Symlink canonical asset to repos (`--to`) |
| `sync` | `commands/sync.ts` | Re-fetch GitHub-sourced assets |
| `remove` | `commands/remove.ts` | Remove repo or specific asset |
| `agents` | `commands/agents.ts` | List detected AI agents per repo |

### CLI Config (`src/cli/cli-config.ts`)

- **`loadCliConfig()`** — Reads `~/.assets/.lattice/config.json`, returns `LatticeConfig`
- **`saveCliConfig(config)`** — Writes config to disk, preserving lattice-managed fields via `mergeLatticeConfig`
- **`mergeLatticeConfig(incoming, existing)`** — Pure function. Merges incoming config with existing on-disk config. Preserves `hiddenRepos` from the existing file when the incoming value is the default (empty array). Callers that intentionally modify `hiddenRepos` pass the modified array, which is kept as-is
- **`getLatticeDir()`** — Returns `~/.assets/.lattice/` path

**Backwards compatibility:** `loadCliConfig` migrates legacy string `canonicalPath` to `canonicalPaths[]` and legacy boolean `scanGlobal` to `globalPaths[]`.

**Lattice-managed fields:** `hiddenRepos` is owned by the lattice config file, not VSCode settings. The extension startup (`ensureLatticeStore`) loads the existing config first and only overlays VSCode-owned fields (`roots`, `maxDepth`, `ignoreDirs`, `canonicalPaths`, `globalPaths`), leaving lattice-managed fields untouched.

### Output (`src/cli/output.ts`)

Terminal formatting utilities — ANSI colors, table rendering, badges. Used by all commands for consistent CLI output.

---

## Convert to Symlink (`src/services/convert-to-symlink.ts`)

Converts a local copy of an asset into a canonical symlink.

### `convertToSymlink(asset, allRepos, canonicalPath, copyFn): Promise<OperationResult>`

1. Copies asset to canonical path (`~/.assets/.claude/<type-dir>/`)
2. Replaces the original with a relative symlink
3. Returns `OperationResult` with the canonical path

Throws `CcmError('CONVERT_FAILED')` if the copy to canonical fails.

---

## Error Handling Patterns

- **Typed errors:** `CcmError` with `CcmErrorCode` union type and context record
- **Results over exceptions:** Service functions return `OperationResult` for expected outcomes
- **CcmError for unexpected failures:** File system errors, symlink failures
- **Best-effort tracking:** Context store + git commits wrapped in try/catch — never block operations

---

## Related Documents

- [Data Model](02-data-model.md) — Types consumed and produced by these services
- [Architecture](01-architecture.md) — How services fit in the project structure

## File References

| File | Role |
|---|---|
| `src/constants.ts` | CONTEXT_DIRS, HIDDEN_ASSET_TYPES, display/truncation utilities |
| `src/services/config.ts` | LatticeConfig interface (incl. hiddenRepos), defaults, expandHome utility |
| `src/services/result.ts` | OperationResult type |
| `src/services/fs-utils.ts` | Shared symlink-aware helpers: isDirEntry, isFileEntry, isSymlinkToDir |
| `src/services/scanner.ts` | Scanner class, repo discovery (.git + context dir validation), discoverGitRepos, global + canonical repos |
| `src/services/asset-enumerator.ts` | Shared asset directory walker |
| `src/services/hasher.ts` | hashFile, hashDirectory |
| `src/services/sync-detector.ts` | buildAssetGroups, getInstanceStatus |
| `src/services/path-resolver.ts` | getTargetPath pure function |
| `src/services/file-ops.ts` | copyAsset, moveAsset, deleteAsset, copyAssetToMany |
| `src/services/symlink-ops.ts` | createRelativeSymlink, isCanonicalPath, isCanonicalSymlink, installAsset |
| `src/services/asset-operations.ts` | getDeleteWarning, copyAssetToRepos, moveAssetToRepo, installCanonicalToRepos, findAffectedSymlinks, deleteCanonicalAsset |
| `src/services/context-store.ts` | ContextStore class, context.json schema, buildFromScan merge logic |
| `src/services/lattice-git.ts` | LatticeGit class, auto-commit for context versioning |
| `src/services/github-import.ts` | discoverAssets, installDiscoveredAssets |
| `src/services/git-ops.ts` | parseGitHubUrl, shallowClone, cleanupClone, getHeadCommit |
| `src/services/agent-registry.ts` | AGENT_REGISTRY, detectAgentsInRepo |
| `src/services/preview-extractor.ts` | extractPreview pure function |
| `src/services/watcher.ts` | Watcher class — reconciliation, path exclusion, 2s debounce (only vscode-dependent service) |
| `src/extension.ts` | `refresh()` re-entrancy guard, `ensureLatticeStore` startup sync, status bar asset count |
| `src/vscode-adapter.ts` | readVscodeConfig, showResult — VSCode bridge |
| `src/services/convert-to-symlink.ts` | convertToSymlink — local copy to canonical symlink conversion |
| `src/cli/index.ts` | CLI entry point, command dispatch, version via `__PKG_VERSION__` |
| `src/cli/cli-config.ts` | loadCliConfig, saveCliConfig, mergeLatticeConfig, getLatticeDir |
| `src/cli/output.ts` | Terminal formatting (colors, tables, badges) |
| `src/cli/commands/*.ts` | 10 CLI command handlers (scan, status, list, diff, copy, move, install, sync, remove, agents) |
| `src/errors.ts` | CcmError class, 11 error codes |
