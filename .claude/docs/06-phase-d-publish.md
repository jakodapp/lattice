# Phase D — Branding, Packaging & Publishing

> Publishing the extension to the Visual Studio Marketplace with a new identity, logo, screenshots, and marketing copy.
>
> Updated: 2026-05-15

---

## 1. Publisher Account

| Step | Action |
|------|--------|
| 1 | Sign in at [Azure DevOps](https://dev.azure.com) with a Microsoft account |
| 2 | Create a free organization (if none exists) |
| 3 | Create a Personal Access Token: profile > Personal access tokens > New Token |
| 4 | **Critical:** Organization = "All accessible organizations", Scope = Marketplace > Manage |
| 5 | Copy token immediately (shown only once) |
| 6 | Create publisher at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) |
| 7 | Publisher ID must match `"publisher"` in package.json |

---

## 2. Package.json — Required & Recommended Fields

### Currently present
- `name`, `displayName`, `description`, `version`, `publisher`, `engines`, `categories`, `license`
- `icon` — `"resources/logo.png"`
- `keywords` — 20 keywords (claude, AI agents, dashboard, sync, etc.)
- `galleryBanner` — `{ "color": "#0a0a0f", "theme": "dark" }`
- `bin` — `{ "lattice": "./dist/cli.js" }`

### Must add before publishing

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/<repo>"
  },
  "homepage": "https://github.com/<owner>/<repo>",
  "bugs": {
    "url": "https://github.com/<owner>/<repo>/issues"
  }
}
```

### Categories
Current: `["Other"]`. Better options: `["Other"]` (no perfect match exists for this tool type).

---

## 3. Visual Assets Checklist

| Asset | Spec | Status |
|-------|------|--------|
| **Icon** | PNG, 256x256, square | DONE (`resources/logo.png`) |
| **Gallery banner** | `galleryBanner` in package.json (color + theme, not an image) | DONE |
| **README screenshots** | PNG/GIF, 800-1200px wide, embedded in README.md | TODO |
| **LICENSE file** | `LICENSE` or `LICENSE.md` at repo root | DONE |

### Icon Guidelines
- 256x256 PNG (minimum 128x128, 256 recommended for Retina)
- Square, no rounded corners (the marketplace applies its own rounding)
- Should be recognizable at 32x32 thumbnail size
- Avoid text — it's unreadable at small sizes
- Use the extension's brand colors

### Screenshots for README (marketplace detail page)
Recommended set:
1. **Repositories view** — kanban grid with repo columns and asset chips
2. **Assets view** — card list with type pills and preview boxes
3. **Detail panel** — split-view with file list and markdown preview
4. **Context menu** — right-click actions (Install/Copy/Delete)
5. **Repo picker** — modal overlay with repo cards and checkboxes
6. **Symlink indicator** — chain icon on symlinked assets

Place in `images/` directory. Reference in README with relative paths.

---

## 4. README.md (Marketplace Page)

The root `README.md` becomes the Marketplace detail page. Structure:

```markdown
# <Extension Name>

> One-line tagline

![Hero screenshot](images/hero.png)

## Features
- Visual kanban dashboard for .claude/ configurations
- Manage skills, commands, agents, hooks, rules across all repos
- SHA-256 sync detection — see what's changed at a glance
- Drag-and-drop between repositories
- Symlink-based sharing via canonical ~/.assets path
- Multi-agent detection (Claude, Cursor, Cline, Windsurf, Codex, Copilot...)
- Resizable split-view detail panel with markdown preview
- Install from GitHub URL (Phase C)

## Quick Start
1. Install the extension
2. Set your scan roots: Settings > "latticeContextManager.roots" > add paths
3. Click the status bar button to open the dashboard

## Screenshots
[Repo view] [Assets view] [Detail panel] [Context menu]

## Configuration
| Setting | Default | Description |
|---------|---------|-------------|
| roots | [] | Directories to scan |
| globalPaths | [~/.claude, ~/.cursor, ~/.github] | Global agent configs |
| canonicalPaths | [~/.assets, ~/.agents] | Shared asset libraries |
| maxDepth | 4 | Scan recursion depth |

## License
MIT
```

---

## 5. Publishing Methods

### Method A: Manual Upload (recommended)

The simplest approach — no PAT or Azure CLI needed.

1. Package the extension: `npx @vscode/vsce package`
2. Go to [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
3. Click **New extension** > **Visual Studio Code**
4. Drag and drop the `.vsix` file (or click to upload)
5. Wait for verification (a few minutes)

For updates: click the `...` menu on the existing extension > **Update**

### Method B: CLI with Entra ID

Requires [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and logged in.

```bash
# Login with Azure DevOps scope
az login --scope 499b84ac-1321-427f-aa17-267ca6975798/.default

# Publish (use --githubBranch if publishing from non-main branch)
npx @vscode/vsce publish --azure-credential --githubBranch alpha
```

### Method C: CLI with PAT (deprecated path)

> **Note:** Global PATs ("All accessible organizations") are [being retired](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops/).
> Creation blocked since March 2026, fully retired December 2026.
> Organization-scoped PATs still work but Entra ID is the recommended replacement.

```bash
npx @vscode/vsce login <publisher-id>
npx @vscode/vsce publish
```

### Common options

```bash
npx @vscode/vsce package             # package without publishing
npx @vscode/vsce publish patch       # 0.1.0 → 0.1.1
npx @vscode/vsce publish minor       # 0.1.0 → 0.2.0
npx @vscode/vsce publish --pre-release
```

---

## 6. Pre-Publish Checklist

- [x] New extension name chosen and applied everywhere (Lattice Context Manager)
- [x] Publisher account created at marketplace.visualstudio.com/manage
- [x] Icon designed (`resources/logo.png`)
- [x] `"icon"` field added to package.json
- [x] `"repository"` field added to package.json (https://github.com/jak0da/lattice)
- [x] `"keywords"` field added to package.json (20 terms)
- [x] `"galleryBanner"` field added to package.json
- [x] LICENSE file created at repo root (MIT)
- [x] README.md rewritten for marketplace visitors (features, screenshots, config)
- [x] Screenshots captured (5 views: repos, assets, detail panel, import, repo picker)
- [x] `.vscodeignore` excludes source, tests, .claude/, etc.
- [x] Source maps excluded from production build (only enabled in watch mode)
- [x] `vsce package` produces clean build (170KB — 7 files)
- [x] `vsce ls` reviewed — no sensitive files included
- [x] Extension published via manual .vsix upload (v0.1.0)
- [x] GitHub repo created and pushed (jak0da/lattice)

---

## 7. Post-Publish

- [x] Add Marketplace badges to README (version, installs, rating, license)
- [x] CHANGELOG.md created (marketplace renders this as a separate tab)
- [x] Screenshots verified on marketplace listing
- [ ] Publish to Open VSX Registry (see section 9)
- [ ] Respond to issues and reviews
- Publish updates: package with `vsce package`, then upload .vsix at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
- After 6 months: apply for Verified Publisher badge (requires domain ownership)

---

## 8. CI/CD (Optional)

GitHub Actions workflow for auto-publish on release:

```yaml
name: Publish Extension
on:
  release:
    types: [published]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - uses: HaaLeo/publish-vscode-extension@v2
        with:
          pat: ${{ secrets.VSCE_PAT }}
          registryUrl: https://marketplace.visualstudio.com
```

Store PAT as repository secret `VSCE_PAT`.

---

## 9. Open VSX Registry

[Open VSX](https://open-vsx.org) is an open alternative to the VS Code Marketplace, used by **Cursor, VSCodium, Gitpod, Eclipse Theia**, and other VS Code forks that can't access Microsoft's marketplace.

Publishing here makes the extension available to a wider audience beyond VS Code.

### Setup

1. Create an account at [open-vsx.org](https://open-vsx.org) (GitHub OAuth)
2. Generate an access token: User Settings > Access Tokens > Create
3. Store the token securely

### Publishing

```bash
# Install ovsx CLI
npm install -g ovsx

# Publish an existing .vsix
ovsx publish lattice-context-manager-0.1.0.vsix -p <open-vsx-token>

# Or build and publish in one step
ovsx publish -p <open-vsx-token>
```

### Manual Upload

Open VSX also supports manual upload at [open-vsx.org/user-settings/extensions](https://open-vsx.org/user-settings/extensions).

### Dual Publishing

To publish to both registries in CI/CD, add a second step to the GitHub Actions workflow:

```yaml
- uses: HaaLeo/publish-vscode-extension@v2
  with:
    pat: ${{ secrets.OPEN_VSX_TOKEN }}
    registryUrl: https://open-vsx.org
```

Store the Open VSX token as repository secret `OPEN_VSX_TOKEN`.

---

## File References

| File | Role |
|---|---|
| `package.json` | Extension manifest — name, icon, keywords, publisher, repository |
| `README.md` | Marketplace detail page (root README, not CLAUDE.md) |
| `LICENSE` | License file for marketplace |
| `resources/logo.png` | Extension icon |
| `images/*.png` | Screenshots for README |
| `esbuild.config.mjs` | Build config (source maps only in watch mode) |
| `.vscodeignore` | Excludes files from .vsix package |
| `CHANGELOG.md` | Changelog — rendered as separate tab on marketplace |
| `.github/workflows/publish.yml` | Optional CI/CD for auto-publish |
