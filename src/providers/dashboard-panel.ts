import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, AssetType, Repo, ASSET_TYPE_LABELS, TYPE_TO_DIR, buildSymlinkTargets } from '../types';
import { SKILL_MD, CLAUDE_MD, SETTINGS_JSON, SETTINGS_LOCAL_JSON, THUMBS_DB, getErrorMessage, truncatePreview, displayHash } from '../constants';
import { copyAsset, deleteAsset } from '../services/file-ops';
import { installAsset } from '../services/symlink-ops';
import { isSymlinkToDir } from '../services/fs-utils';
import { expandHome } from '../services/config';
import { copyAssetToRepos, moveAssetToRepo, installCanonicalToRepos, deleteCanonicalAsset, findAffectedSymlinks, getDeleteWarning } from '../services/asset-operations';
import { exportAssetToAgents } from '../services/agent-export';
import { showResult } from '../vscode-adapter';
import { ContextStore } from '../services/context-store';
import { LatticeGit } from '../services/lattice-git';
import { CcmError } from '../errors';
import { extractPreview } from '../services/preview-extractor';
import { ToExtension, ToWebview, SerializedRepo, SerializedAsset, FileEntry, FileGroup, VersionOption, isContextFile, GLOBAL_MERGED_NAME } from '../webview/types';
import { parseGitHubUrl, shallowClone, cleanupClone, getHeadCommit, getCurrentBranch } from '../services/git-ops';
import { discoverAssets, installDiscoveredAssets } from '../services/github-import';
import { checkForUpdates } from '../services/update-checker';
import { hashDirectory, hashFile } from '../services/hasher';
import { getAgent } from '../services/agent-registry';
import { AgentDef, DEFAULT_TOOL } from '../services/agent-defs';
import { AgentSelection } from '../services/agent-selection';
import { convertToSymlink } from '../services/convert-to-symlink';
import { buildAssetGroups } from '../services/sync-detector';
import { Scanner } from '../services/scanner';
import { readVscodeConfig } from '../vscode-adapter';
import { loadCliConfig, saveCliConfig } from '../cli/cli-config';
import type { ConfigStore } from '../extension';

function serializeAsset(a: Asset): SerializedAsset {
  return {
    name: a.name,
    type: a.type,
    path: a.path,
    isDirectory: a.isDirectory,
    hash: a.hash,
    repoName: a.repoName,
    isSymlink: a.isSymlink,
    canonicalPath: a.canonicalPath,
    tool: a.tool,
  };
}

/** Read first ~3000 bytes of an asset file and extract a preview */
async function readAssetPreview(a: Asset): Promise<string> {
  try {
    const filePath = a.isDirectory ? path.join(a.path, SKILL_MD) : a.path;
    const buf = Buffer.alloc(3000);
    const fh = await fs.open(filePath, 'r');
    try {
      await fh.read(buf, 0, 3000, 0);
    } finally {
      await fh.close();
    }
    return extractPreview(buf.toString('utf8').replace(/\0+$/, ''));
  } catch {
    return '';
  }
}

async function serializeAssetWithPreview(a: Asset): Promise<SerializedAsset> {
  const base = serializeAsset(a);
  base.preview = await readAssetPreview(a);
  return base;
}

async function serializeRepo(r: Repo): Promise<SerializedRepo> {
  // Skip assets already reachable via a .claude/ symlink — avoids duplicate chips.
  const symlinkTargets = buildSymlinkTargets(r.assets);
  const deduped = r.assets.filter(a => !symlinkTargets.has(a.path));
  const assets = await Promise.all(deduped.map(serializeAssetWithPreview));
  if (r.isCanonical) {
    for (const a of assets) { a.isCanonical = true; }
  }
  return {
    name: r.name,
    path: r.path,
    claudePath: r.claudePath,
    assets,
    isGlobal: r.isGlobal,
    isCanonical: r.isCanonical,
    agents: r.agents,
  };
}

export class DashboardPanel {
  private static _instance: DashboardPanel | undefined;
  private _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private _extensionUri: vscode.Uri,
    private _store: ConfigStore,
    private _onRefresh: () => Promise<void>,
    private _agentSelection: AgentSelection,
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: ToExtension) => this._handleMessage(msg),
      null,
      this._disposables,
    );
    this._panel.webview.html = this._getHtml();
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    store: ConfigStore,
    onRefresh: () => Promise<void>,
    agentSelection: AgentSelection,
  ) {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (DashboardPanel._instance) {
      DashboardPanel._instance._panel.reveal(column);
      DashboardPanel._instance.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'lcm.dashboard',
      'Lattice Context Manager',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );

    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'logo.png');
    DashboardPanel._instance = new DashboardPanel(panel, extensionUri, store, onRefresh, agentSelection);
  }

  private _hasRoots(): boolean {
    const config = vscode.workspace.getConfiguration('latticeContextManager');
    const roots = config.get<string[]>('roots', []);
    return roots.length > 0;
  }

  private async _visibleRepos(): Promise<Repo[]> {
    const cliConfig = await loadCliConfig();
    const hiddenPaths = new Set(cliConfig.hiddenRepos);
    return this._store.repos.filter(r => !hiddenPaths.has(r.path));
  }

  refresh() {
    const hasRoots = this._hasRoots();
    this._visibleRepos().then(visible =>
      Promise.all(visible.map(serializeRepo)).then(repos =>
        this._postMessage({ type: 'refresh', repos, hasRoots, selectedAgent: this._agentSelection.id }),
      ),
    );
  }

  init(view: 'repo' | 'type' = 'repo') {
    const hasRoots = this._hasRoots();
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._visibleRepos().then(visible => {
      const currentRepo = workspacePath ? visible.find(r => r.path === workspacePath)?.name : undefined;
      Promise.all(visible.map(serializeRepo)).then(repos =>
        this._postMessage({ type: 'init', repos, view, currentRepo, hasRoots, selectedAgent: this._agentSelection.id }),
      );
    });
  }

  // --- Path validation ---

  private _isPathWithinKnownRepos(filePath: string): boolean {
    return this._store.repos.some(r =>
      (r.isGlobal || r.isCanonical) ? filePath.startsWith(r.claudePath) : filePath.startsWith(r.path),
    );
  }

  private _validatePath(filePath: string): void {
    if (!this._isPathWithinKnownRepos(filePath)) {
      throw new CcmError(
        `Path is outside known repositories: ${filePath}`,
        'PATH_OUTSIDE_ROOTS',
        { path: filePath },
      );
    }
  }

  // --- Asset/repo lookup helpers ---

  private _findAsset(assetPath: string, repoName: string): { asset: Asset; repo: Repo } | undefined {
    const repo = this._store.repos.find(r => r.name === repoName);
    const resolved = assetPath.endsWith(`/${SKILL_MD}`) ? path.dirname(assetPath) : assetPath;
    const asset = repo?.assets.find(a => a.path === assetPath || a.path === resolved);
    if (asset && repo) {return { asset, repo };}
    return undefined;
  }

  private _findAssetAcrossRepos(assetPath: string): { asset: Asset; repo: Repo } | undefined {
    const resolved = assetPath.endsWith(`/${SKILL_MD}`) ? path.dirname(assetPath) : assetPath;
    for (const repo of this._store.repos) {
      const asset = repo.assets.find(a => a.path === assetPath || a.path === resolved);
      if (asset) {return { asset, repo };}
    }
    return undefined;
  }

  // --- Message dispatcher ---

  private async _handleMessage(msg: ToExtension) {
    switch (msg.type) {
      case 'refresh': return this._handleRefresh();
      case 'copy-asset': return this._handleCopyAsset(msg);
      case 'move-asset': return this._handleMoveAsset(msg);
      case 'delete-asset': return this._handleDeleteAsset(msg);
      case 'open-file': return this._handleOpenFile(msg);
      case 'open-detail': return this._handleOpenDetail(msg);
      case 'open-project': return this._handleOpenProject(msg);
      case 'preview-asset': return this._handlePreviewAsset(msg);
      case 'copy-asset-pick': return this._handleCopyAssetPick(msg);
      case 'move-asset-pick': return this._handleMoveAssetPick(msg);
      case 'add-repo': return this._handleAddRepo(msg);
      case 'forget-repo': return this._handleForgetRepo(msg);
      case 'copy-asset-to-repos': return this._handleCopyAssetToRepos(msg);
      case 'move-asset-to-repo': return this._handleMoveAssetToRepo(msg);
      case 'install-canonical': return this._handleInstallCanonical(msg);
      case 'delete-canonical': return this._handleDeleteCanonical(msg);
      case 'import-from-github': return this._handleImportFromGithub();
      case 'install-github-assets': return this._handleInstallGithubAssets(msg);
      case 'cleanup-clone': return this._handleCleanupClone(msg);
      case 'diff-with': return this._handleDiffWith(msg);
      case 'convert-to-symlink': return this._handleConvertToSymlink(msg);
      case 'convert-to-symlink-confirm': return this._handleConvertToSymlinkConfirm(msg);
      case 'add-root': return this._handleAddRoot(msg);
      case 'browse-root': return this._handleBrowseRoot();
      case 'hide-repo': return this._handleHideRepo(msg);
      case 'unhide-repo': return this._handleUnhideRepo(msg);
      case 'discover-repos': return this._handleDiscoverRepos();
      case 'check-updates': return this._handleCheckUpdates();
      case 'update-asset': return this._handleUpdateAsset(msg);
      case 'export-to-agents': return this._handleExportToAgents(msg);
      case 'set-agent': return this._agentSelection.set(msg.agentId);
      case 'open-sidebar': break;
      case 'switch-view': break;
    }
  }

  // --- Individual message handlers ---

  private async _handleRefresh() {
    await this._onRefresh();
    this.refresh();
  }

  /** Update context.json and auto-commit after any mutating operation */
  private async _trackChange(commitMessage: string): Promise<void> {
    const { canonicalBase } = this._getInstallOptions();
    const primaryBase = canonicalBase[0];
    const expanded = expandHome(primaryBase);
    const latticeDir = path.join(expanded, '.lattice');
    try {
      const store = new ContextStore(latticeDir);
      await store.load();
      store.buildFromScan(this._store.repos, primaryBase);
      const changed = await store.save();
      if (changed) {
        const git = new LatticeGit(latticeDir);
        await git.ensureRepo();
        await git.commit(commitMessage);
      }
    } catch (err) {
      console.debug('[LCM] Context tracking failed:', getErrorMessage(err));
    }
  }

  /** Write GitHub source metadata for installed assets into context store */
  private async _trackGitHubSource(
    assets: import('../services/github-import').DiscoveredAsset[],
    sourceUrl: string,
    commitHash: string,
    ref: string,
    subpath?: string,
  ): Promise<void> {
    try {
      const store = new ContextStore(this._latticeDir());
      await store.load();
      for (const asset of assets) {
        const existing = store.data.assets.find(a => a.name === asset.name && a.type === asset.type);
        if (existing) {
          store.trackAsset({
            ...existing,
            source: {
              url: sourceUrl,
              commitHash,
              ref,
              subpath,
              fetchedAt: new Date().toISOString(),
            },
          });
        }
      }
      await store.save();
    } catch (err) {
      console.debug('[LCM] GitHub source tracking failed:', getErrorMessage(err));
    }
  }

  private _latticeDir(): string {
    const { canonicalBase } = this._getInstallOptions();
    return path.join(expandHome(canonicalBase[0]), '.lattice');
  }

  private _getInstallOptions(): { canonicalBase: string[]; copyFn: typeof copyAsset; agent: AgentDef } {
    const config = vscode.workspace.getConfiguration('latticeContextManager');
    return {
      canonicalBase: config.get<string[]>('canonicalPaths', ['~/.assets', '~/.agents']),
      copyFn: copyAsset,
      agent: this._agentSelection.def,
    };
  }

  private async _handleCopyAsset(msg: Extract<ToExtension, { type: 'copy-asset' }>) {
    const source = this._findAsset(msg.assetPath, msg.assetRepoName);
    const targetRepo = this._store.repos.find(r => r.name === msg.targetRepoName);
    if (!source || !targetRepo) {return;}

    try {
      const result = await installAsset(source.asset, targetRepo, this._getInstallOptions());
      await this._onRefresh();
      this.refresh();
      const modeLabel = result.mode === 'symlink' ? 'Linked' : 'Copied';
      vscode.window.showInformationMessage(`${modeLabel} "${source.asset.name}" to ${msg.targetRepoName}`);
      await this._trackChange(`copy: ${source.asset.name} → ${msg.targetRepoName}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Copy failed: ${getErrorMessage(err)}`);
    }
  }

  private async _handleMoveAsset(msg: Extract<ToExtension, { type: 'move-asset' }>) {
    const source = this._findAsset(msg.assetPath, msg.assetRepoName);
    const targetRepo = this._store.repos.find(r => r.name === msg.targetRepoName);
    if (!source || !targetRepo) {return;}

    try {
      await installAsset(source.asset, targetRepo, this._getInstallOptions());
      await deleteAsset(source.asset);
      await this._onRefresh();
      this.refresh();
      vscode.window.showInformationMessage(`Moved "${source.asset.name}" to ${msg.targetRepoName}`);
      await this._trackChange(`move: ${source.asset.name} → ${msg.targetRepoName}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Move failed: ${getErrorMessage(err)}`);
    }
  }

  private async _handleDeleteAsset(msg: Extract<ToExtension, { type: 'delete-asset' }>) {
    const source = msg.repoName
      ? this._findAsset(msg.assetPath, msg.repoName)
      : this._findAssetAcrossRepos(msg.assetPath);

    // Handle files not in asset registry (docs, other detail-panel-only files)
    if (!source) {
      try {
        this._validatePath(msg.assetPath);
      } catch { return; }
      const fileName = path.basename(msg.assetPath);
      const confirm = await vscode.window.showWarningMessage(
        `⚠ This is a unique context file "${fileName}" in ${msg.repoName}.\n\nDeleting it will permanently remove this file. This action cannot be undone.`,
        { modal: true },
        'Delete permanently',
      );
      if (confirm === 'Delete permanently') {
        try {
          await fs.unlink(msg.assetPath);
          await this._onRefresh();
          this.refresh();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to delete: ${getErrorMessage(err)}`);
        }
      }
      return;
    }

    const isSymlink = source.asset.isSymlink;

    // Count how many non-canonical repos have this asset
    const instanceCount = this._store.repos.filter(r =>
      !r.isCanonical && r.assets.some(a => a.name === source.asset.name && a.type === source.asset.type),
    ).length;

    const isAssetsView = msg.viewContext === 'type';
    const { action, label } = getDeleteWarning({
      assetName: source.asset.name,
      repoName: msg.repoName,
      isSymlink,
      isContextFile: isContextFile(source.asset),
      isAssetsView,
      instanceCount,
    });

    const confirm = await vscode.window.showWarningMessage(label, { modal: true }, action);
    if (confirm !== action) return;

    if (isAssetsView && instanceCount > 1) {
      await this._deleteFromAllRepos(source.asset.name, source.asset.type);
    } else {
      await deleteAsset(source.asset);
    }
    await this._onRefresh();
    this.refresh();
  }

  /** Delete an asset from all non-canonical repos (best-effort per repo) */
  private async _deleteFromAllRepos(assetName: string, assetType: AssetType): Promise<void> {
    const targets = this._store.repos
      .filter(r => !r.isCanonical)
      .flatMap(r => r.assets)
      .filter(a => a.name === assetName && a.type === assetType);

    for (const a of targets) {
      try { await deleteAsset(a); } catch (err) { console.debug(`[LCM] Best-effort delete failed for ${a.path}:`, getErrorMessage(err)); }
    }
  }

  private async _handleOpenFile(msg: Extract<ToExtension, { type: 'open-file' }>) {
    try {
      this._validatePath(msg.assetPath);
      const stat = await fs.stat(msg.assetPath);
      if (stat.isDirectory()) {
        const skillMd = path.join(msg.assetPath, SKILL_MD);
        try {
          await fs.access(skillMd);
          await vscode.window.showTextDocument(vscode.Uri.file(skillMd));
        } catch {
          await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(msg.assetPath));
        }
      } else {
        await vscode.window.showTextDocument(vscode.Uri.file(msg.assetPath));
      }
    } catch (err) {
      if (err instanceof CcmError) {
        vscode.window.showErrorMessage(err.message);
      } else {
        vscode.window.showErrorMessage(`File not found: ${msg.assetPath}`);
      }
    }
  }

  private async _handleOpenDetail(msg: Extract<ToExtension, { type: 'open-detail' }>) {
    // Note: a project repo literally named "GLOBAL" is shadowed by the merged view here
    const repo = msg.repoName === GLOBAL_MERGED_NAME
      ? this._buildMergedGlobalRepo()
      : this._store.repos.find(r => r.name === msg.repoName);
    if (!repo) return;

    const fileGroups = await this._buildFileGroups(repo);
    const claudeMdFiles = await this._buildClaudeMdFiles(repo);

    this._postMessage({ type: 'detail', repo: await serializeRepo(repo), fileGroups, claudeMdFiles });
  }

  /** Synthetic repo backing the merged GLOBAL column; assets keep their real repoName */
  private _buildMergedGlobalRepo(): Repo | undefined {
    const globals = this._store.repos.filter(r => r.isGlobal);
    if (globals.length === 0) return undefined;
    const claudeGlobal = globals.find(r => r.name === '~/.claude');
    return {
      name: GLOBAL_MERGED_NAME,
      path: process.env.HOME ?? '',
      claudePath: claudeGlobal?.claudePath ?? expandHome('~/.claude'),
      assets: globals.flatMap(r => r.assets),
      isGlobal: true,
    };
  }

  private async _buildFileGroups(repo: Repo): Promise<FileGroup[]> {
    const fileGroups: FileGroup[] = [];
    const knownDirs: Array<{ dir: string; label: string; isSkillDir?: boolean }> = [
      { dir: TYPE_TO_DIR.skill!,           label: ASSET_TYPE_LABELS.skill,           isSkillDir: true },
      { dir: TYPE_TO_DIR.agent!,           label: ASSET_TYPE_LABELS.agent },
      { dir: TYPE_TO_DIR.command!,         label: ASSET_TYPE_LABELS.command },
      { dir: TYPE_TO_DIR.hook!,            label: ASSET_TYPE_LABELS.hook },
      { dir: TYPE_TO_DIR.rule!,            label: ASSET_TYPE_LABELS.rule },
      { dir: TYPE_TO_DIR['output-style']!, label: ASSET_TYPE_LABELS['output-style'] },
      { dir: TYPE_TO_DIR.script!,          label: ASSET_TYPE_LABELS.script },
      { dir: 'docs',                       label: 'Docs' },
    ];

    for (const { dir, label, isSkillDir } of knownDirs) {
      const entries = await this._readAssetDir(path.join(repo.claudePath, dir), isSkillDir);
      if (entries.length > 0) { fileGroups.push({ label, entries }); }
    }

    // Assets owned by other tools (.cursor, .codex, .agents, ...), grouped per tool.
    // Skip assets already reachable via a .claude/ symlink — they appear in knownDirs above.
    const symlinkTargets = buildSymlinkTargets(repo.assets);
    const byTool = new Map<string, Asset[]>();
    for (const a of repo.assets) {
      if (!a.tool || symlinkTargets.has(a.path)) continue;
      const list = byTool.get(a.tool) ?? [];
      list.push(a);
      byTool.set(a.tool, list);
    }
    for (const [tool, list] of byTool) {
      const entries: FileEntry[] = [];
      for (const a of list) {
        const filePath = a.isDirectory ? path.join(a.path, SKILL_MD) : a.path;
        let preview = '';
        try {
          preview = truncatePreview(await fs.readFile(filePath, 'utf-8'));
        } catch {
          preview = '(Unable to read)';
        }
        entries.push({ name: a.name, path: filePath, preview });
      }
      const label = getAgent(tool)?.displayName ?? tool;
      fileGroups.push({ label, entries });
    }

    // Special files at .claude/ root (settings)
    const specialFiles: FileEntry[] = [];
    for (const name of [SETTINGS_JSON, SETTINGS_LOCAL_JSON]) {
      const filePath = path.join(repo.claudePath, name);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        specialFiles.push({ name, path: filePath, preview: truncatePreview(content) });
      } catch { /* not present */ }
    }
    if (specialFiles.length > 0) { fileGroups.push({ label: 'Other', entries: specialFiles }); }

    return fileGroups;
  }

  private async _readAssetDir(dirPath: string, isSkillDir?: boolean): Promise<FileEntry[]> {
    let items: import('fs').Dirent[];
    try {
      items = await fs.readdir(dirPath, { withFileTypes: true });
    } catch { return []; }

    // Allow dot-prefixed directories when scanning skills (category folders like .curated/)
    items = items.filter(i => i.name !== THUMBS_DB && (!i.name.startsWith('.') || isSkillDir));
    const entries: FileEntry[] = [];

    if (isSkillDir) {
      // Only directories with SKILL.md are valid skills — loose files are ignored
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        const isDir = item.isDirectory() || (item.isSymbolicLink() && await isSymlinkToDir(itemPath));
        if (isDir) {
          const skillMdPath = path.join(itemPath, SKILL_MD);
          try {
            const content = await fs.readFile(skillMdPath, 'utf-8');
            entries.push({ name: item.name, path: skillMdPath, preview: truncatePreview(content) });
          } catch {
            // No SKILL.md — recurse into subdirectories as category folders
            const nested = await this._readAssetDir(itemPath, true);
            entries.push(...nested);
          }
        }
        // Files directly under skills/ are not valid assets — skip them
      }
    } else {
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        const isDir = item.isDirectory() || (item.isSymbolicLink() && await isSymlinkToDir(itemPath));
        if (item.isFile() || (item.isSymbolicLink() && !isDir)) {
          try {
            const content = await fs.readFile(itemPath, 'utf-8');
            const name = item.name.replace(/\.(md|js)$/, '');
            entries.push({ name, path: itemPath, preview: truncatePreview(content) });
          } catch {
            entries.push({ name: item.name, path: itemPath, preview: '(Unable to read)' });
          }
        } else if (isDir) {
          const nested = await this._readNestedFiles(itemPath, item.name);
          entries.push(...nested);
        }
      }
    }
    return entries;
  }

  private async _buildClaudeMdFiles(repo: Repo): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    const claudeDirMd = path.join(repo.claudePath, CLAUDE_MD);
    try {
      const content = await fs.readFile(claudeDirMd, 'utf-8');
      files.push({ name: 'CLAUDE.md', path: claudeDirMd, preview: truncatePreview(content) });
    } catch { /* not present */ }

    const rootClaudeMd = path.join(repo.path, CLAUDE_MD);
    if (rootClaudeMd !== claudeDirMd) {
      try {
        const content = await fs.readFile(rootClaudeMd, 'utf-8');
        files.push({ name: 'CLAUDE.md (root)', path: rootClaudeMd, preview: truncatePreview(content) });
      } catch { /* not present */ }
    }

    // Root-level instruction files from other conventions (AGENTS.md, GEMINI.md, legacy rule files)
    for (const a of repo.assets.filter(x => x.type === 'instructions')) {
      try {
        const content = await fs.readFile(a.path, 'utf-8');
        files.push({ name: a.name, path: a.path, preview: truncatePreview(content) });
      } catch { /* not readable */ }
    }
    return files;
  }

  private _handleOpenProject(msg: Extract<ToExtension, { type: 'open-project' }>) {
    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.repoPath), { forceNewWindow: true });
  }

  private async _handleForgetRepo(msg: Extract<ToExtension, { type: 'forget-repo' }>) {
    const repo = this._store.repos.find(r => r.name === msg.repoName);
    if (!repo) return;

    // Check if .claude/ has real content — only count assets inside .claude/, not root-level files like CLAUDE.md
    const assetsInClaudeDir = repo.assets.filter(a => a.path.startsWith(repo.claudePath));
    const hasContent = assetsInClaudeDir.length > 0;

    if (hasContent) {
      const choice = await vscode.window.showWarningMessage(
        `"${repo.name}" has ${assetsInClaudeDir.length} asset(s) in .claude/. Review before removing?`,
        { modal: true },
        'Open Project to Review',
        'Remove Anyway',
      );
      if (choice === 'Open Project to Review') {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(repo.path), { forceNewWindow: true });
        return;
      }
      if (choice !== 'Remove Anyway') return;
    } else {
      const confirm = await vscode.window.showWarningMessage(
        `Remove empty .claude/ folder from "${repo.name}"?`,
        { modal: true },
        'Remove',
      );
      if (confirm !== 'Remove') return;
    }

    // Delete .claude/ directory
    try {
      await fs.rm(repo.claudePath, { recursive: true, force: true });
      vscode.window.showInformationMessage(`Removed .claude/ from "${repo.name}"`);
      await this._onRefresh();
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to remove .claude/: ${getErrorMessage(err)}`);
    }
  }

  private async _readNestedFiles(dirPath: string, prefix: string): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];
    let items: import('fs').Dirent[];
    try {
      items = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return entries;
    }
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      if (item.isFile()) {
        try {
          const content = await fs.readFile(itemPath, 'utf-8');
          const name = `${prefix}/${item.name.replace(/\.(md|js)$/, '')}`;
          entries.push({ name, path: itemPath, preview: truncatePreview(content) });
        } catch {
          entries.push({ name: `${prefix}/${item.name}`, path: itemPath, preview: '(Unable to read)' });
        }
      } else if (item.isDirectory()) {
        const nested = await this._readNestedFiles(itemPath, `${prefix}/${item.name}`);
        entries.push(...nested);
      }
    }
    return entries;
  }

  private async _handlePreviewAsset(msg: Extract<ToExtension, { type: 'preview-asset' }>) {
    try {
      this._validatePath(msg.assetPath);
    } catch (err) {
      if (err instanceof CcmError) {
        vscode.window.showErrorMessage(err.message);
      }
      return;
    }

    const found = this._findAssetAcrossRepos(msg.assetPath);
    if (!found) {return;}

    let content = '';
    try {
      if (found.asset.isDirectory) {
        const skillMdPath = path.join(found.asset.path, SKILL_MD);
        content = await fs.readFile(skillMdPath, 'utf-8');
      } else {
        content = await fs.readFile(found.asset.path, 'utf-8');
      }
    } catch {
      content = '(Unable to read file)';
    }

    this._postMessage({ type: 'asset-preview', asset: serializeAsset(found.asset), content });
  }

  private async _handleCopyAssetPick(msg: Extract<ToExtension, { type: 'copy-asset-pick' }>) {
    const source = this._findAsset(msg.assetPath, msg.assetRepoName);
    if (!source) {return;}

    const otherRepos = this._store.repos.filter(r => r.name !== msg.assetRepoName);
    const items = otherRepos.map(r => ({ label: r.name, description: r.path, repo: r }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Copy "${source.asset.name}" to which repo(s)?`,
      canPickMany: true,
    });

    if (!selected || selected.length === 0) {return;}

    for (const item of selected) {
      try {
        await copyAsset(source.asset, item.repo);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to copy to ${item.label}: ${getErrorMessage(err)}`);
      }
    }
    vscode.window.showInformationMessage(`Copied "${source.asset.name}" to ${selected.length} repo(s).`);
    await this._onRefresh();
    this.refresh();
  }

  private async _handleMoveAssetPick(msg: Extract<ToExtension, { type: 'move-asset-pick' }>) {
    const source = this._findAsset(msg.assetPath, msg.assetRepoName);
    if (!source) return;

    const otherRepos = this._store.repos.filter(r => r.name !== msg.assetRepoName);
    const items = otherRepos.map(r => ({ label: r.name, description: r.path, repo: r }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Move "${source.asset.name}" from ${msg.assetRepoName} to...`,
    });
    if (!selected) return;

    const confirm = await vscode.window.showWarningMessage(
      `Move "${source.asset.name}" from ${msg.assetRepoName} to ${selected.label}? This will delete it from ${msg.assetRepoName}.`,
      { modal: true },
      'Move',
    );
    if (confirm !== 'Move') return;

    try {
      await installAsset(source.asset, selected.repo, this._getInstallOptions());
      await deleteAsset(source.asset);
      vscode.window.showInformationMessage(`Moved "${source.asset.name}" to ${selected.label}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`Move failed: ${getErrorMessage(err)}`);
    }
    await this._onRefresh();
    this.refresh();
  }

  private async _handleCopyAssetToRepos(msg: Extract<ToExtension, { type: 'copy-asset-to-repos' }>) {
    const source = this._findAssetAcrossRepos(msg.assetPath);
    if (!source) return;
    const targets = msg.targetRepoNames.map(n => this._store.repos.find(r => r.name === n)).filter((r): r is Repo => !!r);
    const result = await copyAssetToRepos(source.asset, targets, this._getInstallOptions());
    showResult(result);
    await this._onRefresh();
    this.refresh();
    await this._trackChange(`copy: ${source.asset.name} → ${msg.targetRepoNames.join(', ')}`);
  }

  private async _handleMoveAssetToRepo(msg: Extract<ToExtension, { type: 'move-asset-to-repo' }>) {
    const source = this._findAssetAcrossRepos(msg.assetPath);
    const targetRepo = this._store.repos.find(r => r.name === msg.targetRepoName);
    if (!source || !targetRepo) return;
    try {
      const result = await moveAssetToRepo(source.asset, targetRepo, this._getInstallOptions());
      showResult(result);
    } catch (err) {
      vscode.window.showErrorMessage(`Move failed: ${getErrorMessage(err)}`);
    }
    await this._onRefresh();
    this.refresh();
    await this._trackChange(`move: ${source.asset.name} → ${msg.targetRepoName}`);
  }

  private async _handleInstallCanonical(msg: Extract<ToExtension, { type: 'install-canonical' }>) {
    const canonicalRepos = this._store.repos.filter(r => r.isCanonical);
    let asset: Asset | undefined;
    for (const cr of canonicalRepos) {
      asset = cr.assets.find(a => a.path === msg.assetPath);
      if (asset) break;
    }
    if (!asset) return;
    const targets = msg.targetRepoNames.map(n => this._store.repos.find(r => r.name === n)).filter((r): r is Repo => !!r);
    const canonicalBases = canonicalRepos.map(r => r.path);
    const result = await installCanonicalToRepos(asset, targets, canonicalBases, this._agentSelection.def);
    showResult(result);
    await this._onRefresh();
    this.refresh();
    await this._trackChange(`install: ${asset.name} → ${msg.targetRepoNames.join(', ')}`);
  }

  private async _handleDeleteCanonical(msg: Extract<ToExtension, { type: 'delete-canonical' }>) {
    let asset: Asset | undefined;
    for (const cr of this._store.repos.filter(r => r.isCanonical)) {
      asset = cr.assets.find(a => a.path === msg.assetPath);
      if (asset) break;
    }
    if (!asset) return;

    const affected = findAffectedSymlinks(asset, this._store.repos);
    let warningMsg = `Delete "${asset.name}" from canonical path?`;
    if (affected.length > 0) {
      warningMsg += `\n\nThis will also remove symlinks from:\n${affected.join(', ')}`;
    }
    const confirm = await vscode.window.showWarningMessage(warningMsg, { modal: true }, 'Delete');
    if (confirm !== 'Delete') return;

    try {
      const result = await deleteCanonicalAsset(asset, this._store.repos);
      showResult(result);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to delete: ${getErrorMessage(err)}`);
    }
    await this._onRefresh();
    this.refresh();
    await this._trackChange(`delete: ${asset.name} from canonical`);
  }

  // --- GitHub Import handlers ---

  private async _handleImportFromGithub() {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter a GitHub repository URL or path to a skill',
      placeHolder: 'https://github.com/owner/repo/tree/branch/skills/my-skill',
      validateInput: (value) => {
        if (!value.trim()) return 'URL is required';
        if (!parseGitHubUrl(value)) return 'Invalid GitHub URL format';
        return undefined;
      },
    });
    if (!url) return;

    const parsed = parseGitHubUrl(url);

    try {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Cloning repository...' },
        async () => {
          const clone = await shallowClone(url);
          const assets = await discoverAssets(clone.localPath, parsed?.subpath);
          return { clone, assets };
        },
      );

      if (result.assets.length === 0) {
        vscode.window.showInformationMessage('No .claude/ assets found in this repository.');
        await cleanupClone(result.clone.localPath);
        return;
      }

      const serialized = result.assets.map(a => ({
        name: a.name, type: a.type, sourcePath: a.sourcePath,
        isDirectory: a.isDirectory, preview: a.preview.slice(0, 200),
      }));
      this._postMessage({ type: 'github-assets', repoName: result.clone.repoName, clonePath: result.clone.localPath, sourceUrl: url, assets: serialized });
    } catch (err) {
      vscode.window.showErrorMessage(`Import failed: ${getErrorMessage(err)}`);
    }
  }

  private async _handleInstallGithubAssets(msg: Extract<ToExtension, { type: 'install-github-assets' }>) {
    const parsedSource = parseGitHubUrl(msg.sourceUrl);
    const discovered = await discoverAssets(msg.clonePath, parsedSource?.subpath);
    const selected = discovered.filter(a => msg.assetPaths.includes(a.sourcePath));
    const targets = msg.targetRepoNames
      .map(n => this._store.repos.find(r => r.name === n))
      .filter((r): r is Repo => !!r);

    try {
      // Capture commit hash and branch before cleanup
      const commitHash = await getHeadCommit(msg.clonePath).catch(() => 'unknown');
      const ref = parsedSource?.branch ?? await getCurrentBranch(msg.clonePath).catch(() => 'main');
      const count = await installDiscoveredAssets(selected, targets, this._getInstallOptions());
      vscode.window.showInformationMessage(`Installed ${count} asset(s) successfully.`);
      await this._onRefresh();
      this.refresh();

      // Write GitHub source metadata to context store
      await this._trackGitHubSource(selected, msg.sourceUrl, commitHash, ref, parsedSource?.subpath);
      await this._trackChange(`github-install: ${selected.map(a => a.name).join(', ')} from ${msg.sourceUrl}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Install failed: ${getErrorMessage(err)}`);
    } finally {
      await cleanupClone(msg.clonePath);
    }
  }

  private async _handleCleanupClone(msg: Extract<ToExtension, { type: 'cleanup-clone' }>) {
    await cleanupClone(msg.clonePath);
  }

  // --- GitHub update handlers ---

  /** Lightweight background check: one ls-remote per source, never blocks or surfaces errors */
  private async _handleCheckUpdates() {
    try {
      const store = new ContextStore(this._latticeDir());
      await store.load();
      const updates = await checkForUpdates(store.getGitHubAssets());
      this._postMessage({
        type: 'update-status',
        updates: updates.map(u => ({ name: u.name, type: u.type, remoteCommit: u.remoteCommit })),
      });
    } catch (err) {
      console.debug('[LCM] Update check failed:', getErrorMessage(err));
    }
  }

  private async _handleUpdateAsset(msg: Extract<ToExtension, { type: 'update-asset' }>) {
    const store = new ContextStore(this._latticeDir());
    await store.load();
    const tracked = store.data.assets.find(a => a.name === msg.assetName && a.type === msg.assetType);
    if (!tracked?.source) {
      vscode.window.showWarningMessage(`No GitHub source recorded for "${msg.assetName}".`);
      return;
    }
    const source = tracked.source;

    let clonePath: string | undefined;
    try {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Updating "${msg.assetName}" from ${source.url}...` },
        async () => {
          const clone = await shallowClone(source.url, source.ref);
          const parsed = parseGitHubUrl(source.url);
          const discovered = await discoverAssets(clone.localPath, source.subpath ?? parsed?.subpath);
          return { clone, discovered };
        },
      );
      clonePath = result.clone.localPath;

      const upstream = result.discovered.find(a => a.name === msg.assetName && a.type === msg.assetType);
      if (!upstream) {
        vscode.window.showWarningMessage(`"${msg.assetName}" no longer exists upstream in ${source.url}.`);
        return;
      }

      const newCommit = await getHeadCommit(clonePath).catch(() => 'unknown');
      const upstreamAsset: Asset = {
        name: upstream.name,
        type: upstream.type,
        path: upstream.sourcePath,
        isDirectory: upstream.isDirectory,
        hash: upstream.isDirectory ? await hashDirectory(upstream.sourcePath) : await hashFile(upstream.sourcePath),
        repoName: '_github-update',
      };

      const { updated, kept } = await this._applyAssetUpdates(msg.assetName, msg.assetType, upstreamAsset, tracked.canonicalHash);

      tracked.source = { ...source, commitHash: newCommit, fetchedAt: new Date().toISOString() };
      store.trackAsset(tracked);
      await store.save();

      await this._onRefresh();
      this.refresh();
      await this._trackChange(`github-update: ${msg.assetName} → ${displayHash(newCommit)}`);

      const keptNote = kept > 0 ? `, kept local changes in ${kept}` : '';
      const message = updated > 0
        ? `Updated "${msg.assetName}" in ${updated} location(s)${keptNote}.`
        : kept > 0
          ? `Kept local changes for "${msg.assetName}"; source metadata refreshed.`
          : `"${msg.assetName}" already matches upstream; source metadata refreshed.`;
      vscode.window.showInformationMessage(message);
      await this._handleCheckUpdates();
    } catch (err) {
      vscode.window.showErrorMessage(`Update failed: ${getErrorMessage(err)}`);
    } finally {
      if (clonePath) {
        await cleanupClone(clonePath);
      }
    }
  }

  /** Symlinked installs follow their canonical source, so only real copies are replaced */
  private async _applyAssetUpdates(
    assetName: string,
    assetType: AssetType,
    upstreamAsset: Asset,
    canonicalHash: string | undefined,
  ): Promise<{ updated: number; kept: number }> {
    const instances = this._store.repos
      .flatMap(repo => repo.assets
        .filter(a => a.name === assetName && a.type === assetType && !a.isSymlink)
        .map(a => ({ repo, asset: a })));
    let updated = 0;
    let kept = 0;
    for (const { repo, asset } of instances) {
      if (asset.hash === upstreamAsset.hash) continue;
      const modifiedLocally = asset.hash !== canonicalHash;
      if (modifiedLocally && !await this._confirmOverwriteModified(asset, upstreamAsset, repo.name)) {
        kept++;
        continue;
      }
      // Delete-then-copy so files removed upstream don't survive a directory merge.
      // The update lands where the instance lived, not in the selected agent's dir.
      await deleteAsset(asset);
      await copyAsset(upstreamAsset, repo, getAgent(asset.tool ?? DEFAULT_TOOL));
      updated++;
    }
    return { updated, kept };
  }

  private async _handleExportToAgents(msg: Extract<ToExtension, { type: 'export-to-agents' }>) {
    const found = this._findAsset(msg.assetPath, msg.assetRepoName) ?? this._findAssetAcrossRepos(msg.assetPath);
    if (!found) {
      vscode.window.showWarningMessage('Asset not found. Try refreshing the dashboard.');
      return;
    }
    const isGlobalScope = found.repo.isGlobal || found.repo.isCanonical;
    const result = await exportAssetToAgents(found.asset, { repo: isGlobalScope ? undefined : found.repo }, msg.targetAgentIds);
    showResult(result);
    await this._onRefresh();
    this.refresh();
    await this._trackChange(`export: ${found.asset.name} → ${msg.targetAgentIds.join(', ')}`);
  }

  /** Show a diff of local vs upstream, then ask whether to overwrite */
  private async _confirmOverwriteModified(local: Asset, upstream: Asset, repoName: string): Promise<boolean> {
    const localUri = vscode.Uri.file(local.isDirectory ? path.join(local.path, SKILL_MD) : local.path);
    const upstreamUri = vscode.Uri.file(upstream.isDirectory ? path.join(upstream.path, SKILL_MD) : upstream.path);
    try {
      await vscode.commands.executeCommand('vscode.diff', localUri, upstreamUri, `${local.name}: local (${repoName}) ↔ upstream`);
    } catch (err) {
      console.debug('[LCM] Diff preview failed:', getErrorMessage(err));
    }
    const choice = await vscode.window.showWarningMessage(
      `"${local.name}" in ${repoName} was modified after import. Overwrite it with the upstream version?`,
      { modal: true },
      'Overwrite',
      'Keep Local',
    );
    return choice === 'Overwrite';
  }

  // --- Diff handler ---

  private async _handleDiffWith(msg: Extract<ToExtension, { type: 'diff-with' }>) {
    const source = this._findAsset(msg.assetPath, msg.assetRepoName);
    if (!source) return;

    const allAssets = this._store.repos.flatMap(r => r.assets);
    const others = allAssets.filter(a =>
      a.name === source.asset.name && a.type === source.asset.type && a.path !== source.asset.path,
    );

    if (others.length === 0) {
      vscode.window.showInformationMessage('No other versions to compare with.');
      return;
    }

    let target: Asset;
    if (others.length === 1) {
      target = others[0];
    } else {
      const picked = await vscode.window.showQuickPick(
        others.map(a => ({ label: a.repoName, description: displayHash(a.hash), asset: a })),
        { placeHolder: 'Compare with which version?' },
      );
      if (!picked) return;
      target = picked.asset;
    }

    const leftUri = source.asset.isDirectory
      ? vscode.Uri.file(path.join(source.asset.path, SKILL_MD))
      : vscode.Uri.file(source.asset.path);
    const rightUri = target.isDirectory
      ? vscode.Uri.file(path.join(target.path, SKILL_MD))
      : vscode.Uri.file(target.path);

    const title = `${source.asset.name}: ${source.asset.repoName} ↔ ${target.repoName}`;
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
  }

  // --- Convert to symlink handlers ---

  private async _handleConvertToSymlink(msg: Extract<ToExtension, { type: 'convert-to-symlink' }>) {
    const source = this._findAsset(msg.assetPath, msg.assetRepoName);
    if (!source) return;

    const allAssets = this._store.repos
      .filter(r => !r.isCanonical)
      .flatMap(r => r.assets);
    const instances = allAssets.filter(a =>
      a.name === source.asset.name && a.type === source.asset.type,
    );

    const hashes = new Set(instances.map(i => i.hash));
    if (hashes.size <= 1) {
      // All synced — convert directly using the right-clicked version
      await this._executeConvert(source.asset, instances);
      return;
    }

    // Diverged — show version picker
    const versions: VersionOption[] = [];
    for (const inst of instances) {
      const preview = await this._readAssetPreview(inst.path);
      versions.push({ repoName: inst.repoName, path: inst.path, hash: inst.hash, preview });
    }
    this._postMessage({
      type: 'version-pick',
      assetName: source.asset.name,
      assetPath: msg.assetPath,
      assetRepoName: msg.assetRepoName,
      versions,
    });
  }

  private async _handleConvertToSymlinkConfirm(msg: Extract<ToExtension, { type: 'convert-to-symlink-confirm' }>) {
    const sourceAsset = this._findAssetAcrossRepos(msg.sourceAssetPath);
    if (!sourceAsset) return;

    const allAssets = this._store.repos
      .filter(r => !r.isCanonical)
      .flatMap(r => r.assets);
    const instances = allAssets.filter(a =>
      a.name === sourceAsset.asset.name && a.type === sourceAsset.asset.type,
    );

    await this._executeConvert(sourceAsset.asset, instances);
  }

  private async _executeConvert(sourceAsset: Asset, allInstances: Asset[]) {
    const { canonicalBase } = this._getInstallOptions();
    try {
      const result = await convertToSymlink(sourceAsset, allInstances, canonicalBase[0]);
      const msg = result.failedRepos.length > 0
        ? `Converted to symlink in ${result.convertedRepos.length} repo(s). Failed: ${result.failedRepos.join(', ')}`
        : `Converted to symlink in ${result.convertedRepos.length} repo(s).`;
      vscode.window.showInformationMessage(msg);
      await this._trackChange(`convert: ${sourceAsset.name} to symlink in ${result.convertedRepos.length} repo(s)`);
    } catch (err) {
      vscode.window.showErrorMessage(`Convert failed: ${getErrorMessage(err)}`);
    }
    await this._onRefresh();
    this.refresh();
  }

  private async _readAssetPreview(assetPath: string): Promise<string> {
    try {
      const stat = await fs.stat(assetPath);
      const filePath = stat.isDirectory() ? path.join(assetPath, SKILL_MD) : assetPath;
      const content = await fs.readFile(filePath, 'utf-8');
      return truncatePreview(content);
    } catch { return ''; }
  }

  private async _addRootToConfig(rootPath: string) {
    const config = vscode.workspace.getConfiguration('latticeContextManager');
    const current = config.get<string[]>('roots', []);
    if (current.includes(rootPath)) {
      vscode.window.showInformationMessage(`"${rootPath}" is already in scan roots.`);
      return;
    }
    await config.update('roots', [...current, rootPath], vscode.ConfigurationTarget.Global);
    this._postMessage({ type: 'root-added', rootPath });
    await this._onRefresh();
    this.refresh();
  }

  private async _handleAddRoot(msg: Extract<ToExtension, { type: 'add-root' }>) {
    const rootPath = msg.rootPath.trim();
    if (!rootPath) return;
    const expanded = expandHome(rootPath);
    try {
      await fs.access(expanded);
    } catch {
      vscode.window.showErrorMessage(`Directory not found: ${rootPath}`);
      return;
    }
    await this._addRootToConfig(rootPath);
  }

  private async _handleBrowseRoot() {
    const uri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Add Root Directory',
      title: 'Select a root directory to scan for repos',
    });
    if (!uri || uri.length === 0) return;
    await this._addRootToConfig(uri[0].fsPath);
  }

  private async _handleHideRepo(msg: Extract<ToExtension, { type: 'hide-repo' }>) {
    const cliConfig = await loadCliConfig();
    if (!cliConfig.hiddenRepos.includes(msg.repoPath)) {
      cliConfig.hiddenRepos = [...cliConfig.hiddenRepos, msg.repoPath];
      await saveCliConfig(cliConfig);
      const repoName = this._store.repos.find(r => r.path === msg.repoPath)?.name ?? path.basename(msg.repoPath);
      await this._commitConfigChange(`hide: ${repoName}`);
    }
    this.refresh();
  }

  private async _handleUnhideRepo(msg: Extract<ToExtension, { type: 'unhide-repo' }>) {
    const cliConfig = await loadCliConfig();
    cliConfig.hiddenRepos = cliConfig.hiddenRepos.filter(p => p !== msg.repoPath);
    await saveCliConfig(cliConfig);
    const repoName = this._store.repos.find(r => r.path === msg.repoPath)?.name ?? path.basename(msg.repoPath);
    await this._commitConfigChange(`unhide: ${repoName}`);
    await this._onRefresh();
    this.refresh();
  }

  /** Commit config.json changes directly (bypasses context.json change gate) */
  private async _commitConfigChange(commitMessage: string): Promise<void> {
    const { canonicalBase } = this._getInstallOptions();
    const expanded = expandHome(canonicalBase[0]);
    const latticeDir = path.join(expanded, '.lattice');
    try {
      const git = new LatticeGit(latticeDir);
      await git.ensureRepo();
      await git.commit(commitMessage);
    } catch (err) {
      console.debug('[LCM] Config commit failed:', getErrorMessage(err));
    }
  }

  private async _handleDiscoverRepos() {
    const cliConfig = await loadCliConfig();
    const hiddenPaths = new Set(cliConfig.hiddenRepos);

    // Hidden repos: cross-reference hidden paths with actual scanned repos
    const hiddenRepos = this._store.repos
      .filter(r => hiddenPaths.has(r.path))
      .map(r => ({ name: r.name, path: r.path }));

    // Uninitialized repos: git repos without a context folder
    const scanner = new Scanner(readVscodeConfig());
    const uninitializedRepos = await scanner.discoverGitRepos();

    this._postMessage({ type: 'discovered-repos', hiddenRepos, uninitializedRepos });
  }

  private async _handleAddRepo(msg?: Extract<ToExtension, { type: 'add-repo' }>) {
    let repoPath: string | undefined = msg?.repoPath;

    const configDir = this._agentSelection.def.configDir;
    if (!repoPath) {
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Add Repository',
        title: `Select a repository to add ${configDir}/ folder`,
      });
      if (!uri || uri.length === 0) return;
      repoPath = uri[0].fsPath;
    }
    // Validate that the selected folder is a git repository
    const gitDir = path.join(repoPath, '.git');
    try {
      await fs.access(gitDir);
    } catch {
      vscode.window.showWarningMessage(
        `"${path.basename(repoPath)}" is not a git repository. Initialize a git repo first, then try again.`,
      );
      return;
    }

    // Create only the selected agent's config dir; subdirs are created lazily on write
    try {
      await fs.mkdir(path.join(repoPath, configDir), { recursive: true });
      vscode.window.showInformationMessage(`Created ${configDir}/ in ${path.basename(repoPath)}`);
      await this._onRefresh();
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create ${configDir}/: ${getErrorMessage(err)}`);
    }
  }

  // --- Internals ---

  private _postMessage(msg: ToWebview) {
    this._panel.webview.postMessage(msg);
  }

  private _getHtml(): string {
    const webviewUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Lattice Context Manager</title>
  <style>
    :root {
      --color-skill: #0080FF;
      --color-command: #00FF41;
      --color-agent: #EAB308;
      --color-rule: #EF4444;
      --color-script: #A1A1AA;
      --color-skill-bg: rgba(0, 128, 255, 0.12);
      --color-command-bg: rgba(0, 255, 65, 0.12);
      --color-agent-bg: rgba(234, 179, 8, 0.12);
      --color-rule-bg: rgba(239, 68, 68, 0.12);
      --color-script-bg: rgba(161, 161, 170, 0.12);
      --color-skill-border: rgba(0, 128, 255, 0.35);
      --color-command-border: rgba(0, 255, 65, 0.35);
      --color-agent-border: rgba(234, 179, 8, 0.35);
      --color-rule-border: rgba(239, 68, 68, 0.35);
      --color-script-border: rgba(161, 161, 170, 0.35);
      --color-claude: #E87B35;
      --color-claude-bg: rgba(232, 123, 53, 0.12);
    }
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
    body.vscode-dark, body.vscode-high-contrast {
      --hljs-kw: #569cd6; --hljs-str: #ce9178; --hljs-cmt: #6a9955;
      --hljs-num: #b5cea8; --hljs-fn: #dcdcaa; --hljs-type: #4ec9b0;
      --hljs-builtin: #9cdcfe; --hljs-regexp: #d16969; --hljs-meta: #569cd6;
      --hljs-default: #d4d4d4;
    }
    body.vscode-light {
      --hljs-kw: #0000ff; --hljs-str: #a31515; --hljs-cmt: #008000;
      --hljs-num: #098658; --hljs-fn: #795e26; --hljs-type: #267f99;
      --hljs-builtin: #001080; --hljs-regexp: #811f3f; --hljs-meta: #0000ff;
      --hljs-default: #000000;
    }
  </style>
</head>
<body>
  <dashboard-app></dashboard-app>
  <script nonce="${nonce}" type="module" src="${webviewUri}"></script>
</body>
</html>`;
  }

  dispose() {
    DashboardPanel._instance = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
