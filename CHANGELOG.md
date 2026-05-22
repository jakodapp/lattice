# Changelog

All notable changes to the Lattice Context Manager extension will be documented in this file.

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
