# Lattice Context Manager

> Visual dashboard to manage AI agent configurations across all your repositories

[<img src="https://cdn.vsassets.io/v/M273_20260428.4/_content/Header/vs-logo.png" width="170" style="background-color: black; padding: 10px;" alt="VS Code Marketplace">](https://marketplace.visualstudio.com/items?itemName=Jakoda.lattice-context-manager)&nbsp;&nbsp;[<img src="https://outreach.eclipse.foundation/hs-fs/hubfs/OpenVSX-logo.png?width=369&height=117&name=OpenVSX-logo.png" style="background-color: white; padding: 10px;" width="150" alt="Open VSX">](https://open-vsx.org/extension/Jakoda/lattice-context-manager)

Manage `.claude/`, `.cursor/`, `.github/copilot-instructions` and other AI agent config directories from a single kanban-style dashboard. See what's synced, what's diverged, and move assets between repos with drag-and-drop.

![Dashboard — Repositories view](images/dashboard-repos.png)

## Features

- **Kanban dashboard** — visual grid of all your repos and their AI configurations
- **Multi-agent support** — Claude, Cursor, Cline, Windsurf, Codex, Copilot and more
- **Sync detection** — SHA-256 content hashing shows which assets are in sync, diverged, or unique
- **Drag-and-drop** — copy or move skills, commands, agents, rules between repositories
- **Symlink sharing** — share assets via a canonical `~/.assets` path instead of duplicating files
- **Detail panel** — resizable split-view with file list and markdown preview
- **GitHub import** — install skills and commands directly from a GitHub URL, with subpath support
- **Hide/unhide repos** — toggle repository visibility from a discovery modal
- **Recursive skill detection** — discovers nested `SKILL.md` files in skill directories
- **Global config** — includes `~/.claude/` global configuration in the dashboard

## Screenshots

### Assets View
Browse all assets across repos with descriptions and type badges.

![Assets view](images/dashboard-assets.png)

### Detail Panel
Inspect any asset with a resizable split-view — file list on the left, markdown preview on the right.

![Detail panel](images/detail-panel.png)

### GitHub Import
Install skills and commands directly from a GitHub URL.

![GitHub import](images/github-import.png)

### Repo Picker
Copy or move assets to multiple repositories at once.

![Repo picker](images/repo-picker.png)

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Open Settings and add your project directories to **Lattice Context Manager: Roots** (e.g., `~/Projects`)
3. Click the Lattice icon in the status bar to open the dashboard

## Asset Types

| Type | Source | Example |
|------|--------|---------|
| Skill | `.claude/skills/` | Reusable skill directories with SKILL.md |
| Command | `.claude/commands/` | Slash command templates |
| Agent | `.claude/agents/` | Agent configuration files |
| Rule | `.claude/rules/` | Project rules and constraints |
| Doc | `.claude/docs/` | Reference documentation |
| Settings | `.claude/settings.json` | Claude Code settings |
| CLAUDE.md | `CLAUDE.md` | Project instructions |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `latticeContextManager.roots` | `[]` | Directories to scan for repositories |
| `latticeContextManager.maxDepth` | `4` | How deep to scan for config directories |
| `latticeContextManager.installMode` | `copy` | `copy` duplicates files, `symlink` creates links to canonical location |
| `latticeContextManager.canonicalPath` | `~/.assets` | Shared asset library path for symlink mode |
| `latticeContextManager.scanGlobal` | `true` | Include `~/.claude/` global config |
| `latticeContextManager.ignoreDirs` | `[node_modules, ...]` | Directories to skip during scanning |

## Commands

All commands are available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- **LCM: Open Dashboard** — open the kanban dashboard
- **LCM: Copy to Repo** — copy an asset to another repository
- **LCM: Move to Repo** — move an asset to another repository
- **LCM: Diff With** — compare an asset across repositories
- **LCM: Push to All Repos** — sync an asset to all repositories
- **LCM: Install to Selected Repos** — pick target repos for installation
- **LCM: Import from GitHub URL** — install a skill or command from GitHub
- **LCM: Refresh** — rescan all directories

## License

MIT
