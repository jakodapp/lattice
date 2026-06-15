# Changelog

All notable changes to the Lattice Context Manager extension will be documented in this file.

## [0.1.4] - 2026-06-15

### Added
- **Agent selector in the header** — `Lattice [Claude ▾] [Repositories] [Assets]`. The selected agent scopes every write flow: copy, move, install, GitHub import, and Add Repository all target the selected agent's config dir (e.g. `.cursor/`), using the export-rule matrix for renames (`.mdc`, `.prompt.md`) and format conversions (`.toml`)
- First launch detects the host IDE (Cursor → Cursor, Antigravity → Gemini, otherwise Claude); manual choices persist per machine
- Assets not usable by the selected agent render greyed-out and non-draggable; preview and context menu (including "Export to agent…") still work

### Changed
- Add Repository now creates only the selected agent's config dir (empty — subdirs are created lazily on first write) instead of `.claude/` with four subdirs
- Antigravity merged into the Gemini entry (`.gemini`, `~/.gemini`) — they share one config; the incorrect `.agent` directory convention removed; Gemini now also scans project `rules/` and `workflows/`
- Canonical installs to a convert-format target (e.g. a rule into Cursor) copy-convert instead of symlinking raw content

### Removed
- Windsurf, Cline, Roo Code, and Continue support — repos detectable only through those dirs disappear from the dashboard and reappear under "Discover repositories" as uninitialized
- `latticeContextManager.defaultContextDir` setting — writes always target the selected agent's dir; a leftover user setting is ignored

## [0.1.3] - 2026-06-11

### Added
- Multi-tool asset detection — assets from `.cursor/` (rules `.mdc`, commands, skills, agents), `.codex/` (skills, prompts), `.agents/` and legacy `.agent/` (Antigravity: skills, rules, workflows), `.github/` (Copilot instructions, prompts, agents, chatmodes, skills), `.windsurf/`, `.clinerules/`, `.roo/`, `.gemini/` are now first-class assets tagged with their owning tool
- New asset types: `workflow` (Antigravity/Windsurf/Cline workflows) and `instructions` (root-level AGENTS.md, GEMINI.md, legacy `.cursorrules`/`.windsurfrules`/`.roorules`)
- Repos with only a non-Claude context folder (e.g. `.codex/` or `.agents/`) are now discovered
- `latticeContextManager.defaultContextDir` setting — new installs/copies write into `.agents/` (universal standard) by default, switchable to `.claude`
- Global paths default expanded with `~/.codex` and `~/.gemini`; tool-specific global dirs are scanned with their own layout
- "Install to Repo" button in the asset detail view, next to "Open in Editor"
- GitHub update flow — background `git ls-remote` check on dashboard load marks imported assets with an update badge; an "Update" button re-clones the source, replaces installations, and records the new commit
- Conflict handling on update — locally modified assets open a diff against upstream and ask per-instance to overwrite or keep
- Detail panel file list now shows per-tool asset groups and non-Claude instruction files
- Unreadable asset handling — assets with permission errors or broken symlinks get an `UNREADABLE_HASH` sentinel instead of crashing the scan
- Warning icon (yellow triangle) on diverged assets in detail panel file list
- `sourceUrl` displayed as a clickable link in the GitHub import asset picker header
- Majority hash tie-breaking — when no single hash has the highest count, all instances show as modified

### Changed
- GitHub import now records the actual branch and subpath in the asset source metadata (previously hardcoded `main`)
- Asset copy/install target paths resolve through the repo write target (`defaultContextDir`) instead of always `.claude/`
- Diverged detection switched from `type::name` keys to path-based matching (`divergedPaths: Set<string>`)
- Skills directory scanning now requires `SKILL.md` — loose files directly under `skills/` are skipped
- Skill path resolution in dashboard panel handles `SKILL.md` suffix → parent directory lookup
- Context menu for unreadable assets restricted to "Remove from repo" only
- Group-level sync status in `buildAssetGroups` filters out `UNREADABLE_HASH` before comparison
- `sourceUrl` link validated to start with `https://` before rendering as anchor

### Fixed
- Scanner crash when encountering unreadable files during hashing
- Repo build failures silently halting the entire scan (now caught and logged)
- Detail panel not refreshing after data reload when already open
- Repository URLs in `package.json` updated to `jakodapp/lattice`
- Assets symlinked from `.claude/` into another tool dir (e.g. `.agents/`) no longer appear twice — once as the symlink and once as the original — in both the kanban column and the detail panel file list
- Detail panel action bar shows "Copy to Repo" for local assets and "Install to Repo" only for canonical/symlinked assets

## [0.1.2] - 2026-05-22

### Added
- Multiple canonical paths support — `canonicalPaths` setting defaults to `['~/.assets', '~/.agents']`
- Multiple global agent paths — `globalPaths` setting defaults to `['~/.claude', '~/.cursor', '~/.github']`
- Canonical repos shown as install targets during GitHub imports with "CANONICAL" badge
- Chain icon on symlinked assets in the detail panel file list
- Blob URL support for GitHub imports (`/blob/main/.../SKILL.md` now accepted alongside `/tree/`)
- Shared `fs-utils.ts` module for symlink-aware filesystem helpers

### Changed
- `canonicalPath` (string) replaced by `canonicalPaths` (string array) — backwards-compatible migration for existing configs
- `scanGlobal` (boolean) replaced by `globalPaths` (string array) — empty array disables global scanning
- `installMode` setting removed — install strategy is now automatic: canonical source creates symlink, everything else copies
- Settings reordered with `order` property: roots, globalPaths, canonicalPaths, maxDepth, ignoreDirs

### Fixed
- Symlinked asset directories (e.g. `~/.claude/skills -> ~/.cursor/skills`) not detected by scanner on WSL
- Symlinked files skipped in detail panel file list (`Dirent.isFile()` returns false for symlinks)
- GitHub import rejecting `/blob/` URLs — only `/tree/` was accepted
- `SKILL.md` filename not stripped from blob URL subpaths, causing failed skill discovery

## [0.1.1] - 2026-05-22

### Added
- Hide/unhide repositories with discovery modal and `.git` validation
- Recursive `SKILL.md` detection for nested skill directories
- Subpath support for GitHub imports (install specific files from a repo)

### Fixed
- Status bar watcher not triggering refresh correctly
- `hiddenRepos` config getting wiped on settings update

## [0.1.0] - 2026-05-16

### Added
- Kanban dashboard with Repositories and Assets views
- Multi-agent support: Claude, Cursor, Cline, Windsurf, Codex, Copilot
- SHA-256 content hashing for sync detection across repositories
- Drag-and-drop copy/move operations between repos
- Symlink-based asset sharing via canonical `~/.assets` path
- Resizable detail panel with markdown preview
- GitHub import — install skills and commands from a URL
- Repo picker for bulk install to multiple repositories
- Context menu actions: copy, move, delete, diff, set as source
- Global `~/.claude/` configuration support
- Search and filter across all assets
- Status bar button to open the dashboard
