import * as vscode from 'vscode';
import * as path from 'path';
import { Asset, AssetGroup, Repo } from './types';
import { getErrorMessage, HIDDEN_ASSET_TYPES } from './constants';
import { expandHome } from './services/config';
import { Scanner } from './services/scanner';
import { Watcher } from './services/watcher';
import { buildAssetGroups } from './services/sync-detector';
import { readVscodeConfig } from './vscode-adapter';
import { ContextStore } from './services/context-store';
import { LatticeGit } from './services/lattice-git';
import { loadCliConfig, writeCliConfigDirect } from './cli/cli-config';
import { openFile } from './commands/open-file';
import { diffWith } from './commands/diff-with';
import { copyToRepo } from './commands/copy-to-repo';
import { moveToRepo } from './commands/move-to-repo';
import { deleteAssetCommand } from './commands/delete-asset';
import { pushToAll } from './commands/push-to-all';
import { updateAllOutdated } from './commands/update-all-outdated';
import { installToSelected } from './commands/install-to-selected';
import { DashboardPanel } from './providers/dashboard-panel';
import { openProject } from './commands/open-project';

export interface ConfigStore {
  repos: Repo[];
  assetGroups: AssetGroup[];
}

function getAsset(arg: unknown): Asset | undefined {
  if (!arg || typeof arg !== 'object') {return undefined;}
  const obj = arg as Record<string, unknown>;
  if ('asset' in obj && obj.asset && typeof obj.asset === 'object') {
    return obj.asset as Asset;
  }
  if ('instances' in obj) {return undefined;}
  if ('group' in obj) {return undefined;}
  if ('path' in obj && 'type' in obj && 'hash' in obj) {
    return obj as unknown as Asset;
  }
  return undefined;
}

function getGroupOrAsset(arg: unknown): Asset | AssetGroup | undefined {
  if (!arg || typeof arg !== 'object') {return undefined;}
  const obj = arg as Record<string, unknown>;
  if ('group' in obj && obj.group && typeof obj.group === 'object') {
    return obj.group as AssetGroup;
  }
  if ('instances' in obj) {return obj as unknown as AssetGroup;}
  return getAsset(arg);
}

export function activate(context: vscode.ExtensionContext) {
  const store: ConfigStore = { repos: [], assetGroups: [] };

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.command = 'lcm.openDashboard';
  statusBar.tooltip = 'Open Lattice Context Manager';
  context.subscriptions.push(statusBar);

  const watcher = new Watcher(() => refresh());
  context.subscriptions.push(watcher);

  let refreshRunning = false;
  let refreshQueued = false;

  async function refresh() {
    if (refreshRunning) {
      refreshQueued = true;
      return;
    }
    refreshRunning = true;

    const scanner = new Scanner(readVscodeConfig());
    statusBar.text = '$(sync~spin) LCM: Scanning...';
    statusBar.show();

    try {
      store.repos = await scanner.scan();
      store.assetGroups = buildAssetGroups(store.repos.flatMap(r => r.assets));

      // Only watch the current workspace's .claude/ folder — that's all the status bar needs.
      // Global, canonical, and other repos are scanned on-demand (dashboard open, manual refresh).
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const currentRepo = workspacePath ? store.repos.find(r => r.path === workspacePath) : undefined;
      watcher.watchRepos(currentRepo ? [currentRepo] : []);

      const localAssetCount = currentRepo
        ? currentRepo.assets.filter(a => !HIDDEN_ASSET_TYPES.has(a.type)).length
        : 0;
      statusBar.text = `$(layout) ${localAssetCount} assets`;
    } catch (err) {
      statusBar.text = '$(error) LCM: Scan failed';
      vscode.window.showErrorMessage(`LCM scan failed: ${getErrorMessage(err)}`);
    } finally {
      refreshRunning = false;
    }

    if (refreshQueued) {
      refreshQueued = false;
      refresh();
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('lcm.refresh', () => refresh()),

    vscode.commands.registerCommand('lcm.openFile', (arg: unknown) => {
      const asset = getAsset(arg);
      if (asset) {openFile(asset);}
    }),

    vscode.commands.registerCommand('lcm.diffWith', (arg: unknown) => {
      const asset = getAsset(arg);
      if (asset) {diffWith(asset, store);}
    }),

    vscode.commands.registerCommand('lcm.copyToRepo', (arg: unknown) => {
      const asset = getAsset(arg);
      if (asset) {copyToRepo(asset, store);}
    }),

    vscode.commands.registerCommand('lcm.moveToRepo', (arg: unknown) => {
      const asset = getAsset(arg);
      if (asset) {moveToRepo(asset, store);}
    }),

    vscode.commands.registerCommand('lcm.delete', (arg: unknown) => {
      const asset = getAsset(arg);
      if (asset) {deleteAssetCommand(asset);}
    }),

    vscode.commands.registerCommand('lcm.pushToAll', (arg: unknown) => {
      const asset = getAsset(arg);
      if (asset) {pushToAll(asset, store);}
    }),

    vscode.commands.registerCommand('lcm.updateAllOutdated', (arg: unknown) => {
      const data = getGroupOrAsset(arg);
      if (data) {updateAllOutdated(data, store);}
    }),

    vscode.commands.registerCommand('lcm.installToSelected', (arg: unknown) => {
      const asset = getAsset(arg);
      if (asset) {installToSelected(asset, store);}
    }),

    vscode.commands.registerCommand('lcm.setAsSource', (arg: unknown) => {
      const data = getGroupOrAsset(arg);
      if (data) {updateAllOutdated(data, store);}
    }),

    vscode.commands.registerCommand('lcm.openDashboard', () => {
      DashboardPanel.createOrShow(context.extensionUri, store, refresh);
    }),

    vscode.commands.registerCommand('lcm.openProject', (arg: unknown) => {
      if (!arg || typeof arg !== 'object') { return; }
      const obj = arg as Record<string, unknown>;
      if ('repo' in obj && obj.repo && typeof (obj.repo as Record<string, unknown>).path === 'string') {
        openProject((obj.repo as Repo).path);
      } else if ('asset' in obj && obj.asset) {
        const asset = obj.asset as Asset;
        const repo = store.repos.find(r => r.name === asset.repoName);
        if (repo) { openProject(repo.path); }
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lcm.importFromGithub', () => {
      DashboardPanel.createOrShow(context.extensionUri, store, refresh);
      // The dashboard panel handles the import flow via webview messages
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('latticeContextManager')) {
        refresh();
      }
    }),
  );

  const latticeConfig = readVscodeConfig();
  if (latticeConfig.roots.length > 0) {
    refresh().then(() => ensureLatticeStore(latticeConfig, store));
  } else {
    statusBar.text = '$(layout) Lattice (0 assets)';
    statusBar.tooltip = 'Set latticeContextManager.roots in settings to start scanning';
    statusBar.show();
  }
}

/** Ensure ~/.assets/.lattice/ git repo exists and context.json reflects current state */
async function ensureLatticeStore(config: import('./services/config').LatticeConfig, store: ConfigStore): Promise<void> {
  const canonicalExpanded = expandHome(config.canonicalPath);
  const latticeDir = path.join(canonicalExpanded, '.lattice');

  try {
    // Persist VSCode-owned settings so CLI uses the same roots.
    // Load existing config first to preserve lattice-managed fields (hiddenRepos),
    // then overlay only the VSCode-owned fields and write directly (no re-read merge).
    const existing = await loadCliConfig();
    await writeCliConfigDirect({
      ...existing,
      roots: config.roots,
      canonicalPath: config.canonicalPath,
      maxDepth: config.maxDepth,
      ignoreDirs: config.ignoreDirs,
      scanGlobal: config.scanGlobal,
      installMode: config.installMode,
    });

    const git = new LatticeGit(latticeDir);
    await git.ensureRepo();

    const ctx = new ContextStore(latticeDir);
    await ctx.load();
    ctx.buildFromScan(store.repos, config.canonicalPath);

    const changed = await ctx.save();

    if (changed) {
      const repoCount = store.repos.filter(r => !r.isCanonical && !r.isGlobal).length;
      const assetCount = ctx.data.assets.length;
      await git.commit(`scan: extension activated, ${repoCount} repos, ${assetCount} assets`);
    }
  } catch (err) {
    console.debug('[LCM] Lattice store init failed:', getErrorMessage(err));
  }
}

export function deactivate() {}
