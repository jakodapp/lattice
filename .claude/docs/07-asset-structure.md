# Asset Structure Rules

> Technical Documentation
>
> Updated: 2026-05-15 | Scope: How each asset type is stored on disk, how the scanner detects them, and the rules for matching, resolving, and operating on them.

---

## Overview

Every asset has a **type** (singular: `skill`, `command`, `agent`...) that maps to a **directory name** (plural: `skills/`, `commands/`, `agents/`...). This mapping is the source of most bugs — the type and directory name are never the same string. This doc is the single reference for how assets are structured on disk and how the scanner, path resolver, file operations, and canonical conversion use these mappings.

---

## The Type ↔ Directory Mapping

There is a **single source of truth** in `src/types.ts`: `ASSET_DIR_ENTRIES`, a tuple array that generates both directions of the mapping. **Never define this mapping elsewhere.**

```typescript
const ASSET_DIR_ENTRIES = [
  ['skill', 'skills'],
  ['command', 'commands'],
  ['agent', 'agents'],
  ['rule', 'rules'],
  ['script', 'scripts'],
  ['hook', 'hooks'],
  ['output-style', 'output-styles'],
] as const;
```

Two derived constants are exported:

| Constant | Direction | Used for | Example |
|---|---|---|---|
| `TYPE_TO_DIR` | type → dir | **Writing** to disk | `TYPE_TO_DIR['command']` → `'commands'` |
| `ASSET_TYPE_DIRS` | dir → type | **Reading** from disk | `ASSET_TYPE_DIRS['commands']` → `'command'` |

**Not in this mapping** (no directory): `settings`, `mcp-config`, `claude-md` — these are root-level files, not directory-based.

To add a new directory-based asset type: add one entry to `ASSET_DIR_ENTRIES`. Both directions update automatically.

---

## Asset Types by Storage Structure

### Directory-based assets (type is in `ASSET_TYPE_DIRS`)

These live inside a typed subdirectory of `.claude/`.

#### Skills (`skill`) — DIRECTORY asset

```
.claude/skills/
├── audit/               ← skill directory (isDirectory: true)
│   ├── SKILL.md         ← required entry file
│   ├── templates/       ← optional supporting files
│   └── LICENSE.txt
└── profile-skill.md     ← also valid: standalone file skill (isDirectory: false)
```

**Scanner detection:**
- `entry.isDirectory()` or symlink to directory → `isDirectory: true`, name = folder name, hash = `hashDirectory()` (deterministic hash of all files)
- `entry.isFile()` ending in `.md` or `.js` → `isDirectory: false`, name = filename without extension, hash = `hashFile()`

**Preview path:** For directory skills, `SKILL.md` inside the directory. For file skills, the file itself.

**Delete behavior:** Directory skills use `fs.rm(path, { recursive: true })`. File skills use `fs.unlink(path)`.

**Critical:** When the `_viewingFile.path` is `…/skill-name/SKILL.md`, the actual asset path is `…/skill-name/`. Match with `viewPath.startsWith(asset.path + '/')`.

#### Commands, Agents, Hooks, Scripts, Output Styles — FILE assets

```
.claude/commands/
├── upsert-docs.md       ← name: "upsert-docs", isDirectory: false
└── scout.md             ← name: "scout", isDirectory: false

.claude/agents/
└── code-reviewer.md     ← name: "code-reviewer"

.claude/hooks/
├── pre-commit.md
└── lint-on-save.js      ← .js files also supported
```

**Scanner detection:** Files ending in `.md` or `.js`. Name = filename without extension. Directories inside these folders are **recursed** (not treated as single assets), except for skills.

#### Rules — FILE assets with nested directory support

```
.claude/rules/
├── code-style.md        ← name: "code-style"
├── security.md          ← name: "security"
└── team/                ← nested directory — recursed, not a single asset
    └── naming.md        ← name: "naming"
```

**Scanner detection:** Same as other file assets, but nested directories are recursed into (not treated as single directory assets like skills).

### Root-level assets (no directory)

These are single files at the `.claude/` root level or repo root. They are NOT in `ASSET_TYPE_DIRS`.

#### Settings (`settings`)

```
.claude/
├── settings.json            ← name: "settings.json"
└── settings.local.json      ← name: "settings.local.json"
```

**Scanner detection:** Exact filename match in `enumerateAssets()`. Not directory-scanned.

**Target path:** `<claudePath>/<filename>` (copied with original filename).

#### MCP Config (`mcp-config`)

```
.claude/
├── mcp_servers.json         ← name: "mcp_servers.json"
└── myproject.mcp.json       ← name: "myproject.mcp.json"
```

**Scanner detection:** `entry.name === 'mcp_servers.json'` or `entry.name.endsWith('.mcp.json')`.

**Target path:** `<claudePath>/<filename>`.

#### CLAUDE.md (`claude-md`)

```
repo-root/
├── CLAUDE.md                ← name: "CLAUDE.md (root)", path = repo root
└── .claude/
    └── CLAUDE.md            ← name: "CLAUDE.md (.claude/)", path = .claude/
```

**Scanner detection:** `entry.name === 'CLAUDE.md'` inside `.claude/` + separate check for `CLAUDE.md` at repo root.

**Target path:** Root variant → `<repoPath>/CLAUDE.md`. Inner variant → `<claudePath>/CLAUDE.md`. Distinguished by checking if `asset.name.includes('root')`.

---

## Canonical Path (`~/.assets/`)

The canonical path is a shared asset library. Its structure mirrors `.claude/` — assets are organized in typed subdirectories.

```
~/.assets/
├── skills/                   ← (if organized in typed dirs)
│   └── universal-formatter/
├── commands/
│   └── upsert-docs.md
├── universal-formatter/      ← (legacy: flat skill, no typed dir wrapper)
│   └── SKILL.md
```

**Scanner behavior (`buildCanonicalRepos`):**
Iterates all `canonicalPaths` (default `['~/.assets', '~/.agents']`). For each:
1. Read top-level entries of the canonical path
2. If entry name is in `ASSET_TYPE_DIRS` → scan as that type (e.g. `commands/` → type `command`)
3. If entry name is NOT in mapping → treat as a skill directory (backwards compat for flat layout)
4. Uses `isDirEntry` from `fs-utils.ts` to follow symlinks when checking entry types

**Convert-to-symlink target:** When converting a local asset to canonical:
- Target = `~/.assets/<TYPE_TO_DIR[type]>/<basename>` (e.g. `~/.assets/commands/upsert-docs.md`)
- Uses `TYPE_TO_DIR` mapping — **never** `ASSET_TYPE_DIRS` (which is the reverse direction)

---

## Symlink Detection

When scanning any asset, the scanner checks if it's a symlink:

1. `fs.lstat(path)` — does NOT follow symlinks
2. If `isSymbolicLink()` → read target with `fs.readlink()`
3. Resolve relative target path relative to the symlink's directory
4. Set `isSymlink: true` and `canonicalPath: <resolved>`

**Critical for file symlinks:** A symlink to a **file** (e.g. `upsert-docs.md → ~/.assets/commands/upsert-docs.md`) must be handled as a file, not a directory. The scanner uses `fs.stat()` (which follows symlinks) to determine if the target is a file or directory before choosing the processing branch.

---

## Context Files (not copyable)

Some asset types are unique per repo and should not be copied/installed between repos:

```typescript
CONTEXT_FILE_TYPES = {'claude-md', 'settings', 'mcp-config'}
```

Additionally, any asset whose path includes `/docs/` is treated as a context file.

Context files: no "Copy to repo" or "Install" actions, no "Installed in" repo tags, delete action is always "Delete permanently".

---

## Hidden Types (not shown in dashboard)

```typescript
HIDDEN_ASSET_TYPES = {'settings', 'claude-md', 'mcp-config'}
```

These types are filtered from both the Repositories view chips and the Assets view cards. They are still shown in the detail panel file list.

---

## Path Resolution Summary

When an asset is copied/installed to a target repo, `getTargetPath()` determines where it goes:

| Asset Type | Target Path |
|---|---|
| `skill` | `<claudePath>/skills/<basename>` |
| `command` | `<claudePath>/commands/<basename>` |
| `agent` | `<claudePath>/agents/<basename>` |
| `rule` | `<claudePath>/rules/<basename>` |
| `script` | `<claudePath>/scripts/<basename>` |
| `hook` | `<claudePath>/hooks/<basename>` |
| `output-style` | `<claudePath>/output-styles/<basename>` |
| `settings` | `<claudePath>/<filename>` |
| `mcp-config` | `<claudePath>/<filename>` |
| `claude-md` (root) | `<repoPath>/CLAUDE.md` |
| `claude-md` (.claude/) | `<claudePath>/CLAUDE.md` |

`<basename>` = `path.basename(asset.path)` — for skills this is the directory name, for files it's the filename with extension.

---

## Common Gotchas

1. **Type ≠ directory name.** `'command'` ≠ `'commands'`. Both are derived from `ASSET_DIR_ENTRIES` in `types.ts` — use `TYPE_TO_DIR` for writing, `ASSET_TYPE_DIRS` for reading. Never hardcode the mapping elsewhere.
2. **Skills can be files OR directories.** A `.md` file directly in `skills/` is a valid skill with `isDirectory: false`.
3. **Symlinks to files look like directories to `readdir`.** `entry.isSymbolicLink()` is true for both — must use `fs.stat()` to check the target.
4. **`_viewingFile.path` ≠ `asset.path` for skills.** The viewing path includes `/SKILL.md`, the asset path is the directory. Match with `startsWith()`.
5. **Copy Path must strip `/SKILL.md`.** The user expects the directory path, not the internal file.
6. **Delete must use `asset.isDirectory` to choose `rm -rf` vs `unlink`.** If the asset isn't found in the registry, check if path ends with `/SKILL.md` to set `isDirectory: true`.
7. **Canonical path uses `TYPE_TO_DIR`.** The canonical structure is `~/.assets/commands/` (plural), not `~/.assets/command/`.

---

## File References

| File | Role |
|---|---|
| `src/types.ts` | `ASSET_DIR_ENTRIES` (single source), `TYPE_TO_DIR` (type→dir), `ASSET_TYPE_DIRS` (dir→type), `Asset` interface |
| `src/services/path-resolver.ts` | `getTargetPath()` — imports `TYPE_TO_DIR` from types |
| `src/services/fs-utils.ts` | `isDirEntry()`, `isFileEntry()`, `isSymlinkToDir()` — shared symlink-aware helpers |
| `src/services/scanner.ts` | `enumerateAssets()`, `enumerateAssetDir()`, `buildCanonicalRepos()`, `buildGlobalRepos()`, `detectSymlink()` |
| `src/services/convert-to-symlink.ts` | `convertToSymlink()` — imports `TYPE_TO_DIR` from types |
| `src/services/file-ops.ts` | `deleteAsset()` — `isDirectory` branch for rm vs unlink |
| `src/providers/dashboard-panel.ts` | `_buildFileGroups()`, `_readAssetDir()` — detail panel file listing |
| `src/webview/types.ts` | `HIDDEN_ASSET_TYPES`, `CONTEXT_FILE_TYPES`, `isContextFile()` |
| `src/webview/components/detail-panel.ts` | `_deleteViewingFile()`, `_copyPath()` — SKILL.md path handling |
