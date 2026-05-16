import * as vscode from 'vscode';
import * as path from 'path';
import { Asset, AssetGroup, AssetType, ASSET_TYPE_LABELS, Repo, SyncStatus } from '../types';
import { displayHash } from '../constants';
import { getInstanceStatus } from '../services/sync-detector';

const SYNC_ICONS: Record<SyncStatus, vscode.ThemeIcon> = {
  synced: new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed')),
  modified: new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground')),
  unique: new vscode.ThemeIcon('circle-outline'),
};

const TYPE_ICONS: Record<AssetType, vscode.ThemeIcon> = {
  'skill': new vscode.ThemeIcon('symbol-method'),
  'command': new vscode.ThemeIcon('terminal'),
  'agent': new vscode.ThemeIcon('robot'),
  'rule': new vscode.ThemeIcon('law'),
  'script': new vscode.ThemeIcon('file-code'),
  'hook': new vscode.ThemeIcon('zap'),
  'mcp-config': new vscode.ThemeIcon('server'),
  'output-style': new vscode.ThemeIcon('paintcan'),
  'settings': new vscode.ThemeIcon('gear'),
  'claude-md': new vscode.ThemeIcon('markdown'),
};

/** Top-level node for an asset type category (e.g. "Skills", "Commands") */
export class AssetTypeItem extends vscode.TreeItem {
  constructor(
    public readonly assetType: AssetType,
    public readonly groups: AssetGroup[],
  ) {
    const totalInstances = groups.reduce((sum, g) => sum + g.instances.length, 0);
    const divergedCount = groups.filter(g => g.syncStatus === 'diverged').length;
    const label = `${ASSET_TYPE_LABELS[assetType]} (${groups.length})`;
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.iconPath = TYPE_ICONS[assetType];
    this.contextValue = 'assetTypeCategory';
    if (divergedCount > 0) {
      this.description = `${divergedCount} diverged`;
    }
  }
}

/** A group node representing one asset that may exist across multiple repos */
export class AssetGroupItem extends vscode.TreeItem {
  constructor(
    public readonly group: AssetGroup,
  ) {
    const label = group.name;
    const hasChildren = group.instances.length > 1;
    super(
      label,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );

    this.description = `${group.instances.length} repo${group.instances.length !== 1 ? 's' : ''}`;
    this.contextValue = `assetGroup.${group.syncStatus}`;

    if (group.syncStatus === 'diverged') {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    } else {
      this.iconPath = TYPE_ICONS[group.type];
    }

    // If only one instance, make it openable directly
    if (group.instances.length === 1) {
      const asset = group.instances[0];
      this.description = asset.repoName;
      this.contextValue = `asset.${group.syncStatus}`;
      this.command = {
        command: 'lcm.openFile',
        title: 'Open File',
        arguments: [asset],
      };
    }
  }
}

/** A single asset instance within a group (in the By Type view) */
export class AssetInstanceItem extends vscode.TreeItem {
  constructor(
    public readonly asset: Asset,
    public readonly group: AssetGroup,
  ) {
    super(asset.repoName, vscode.TreeItemCollapsibleState.None);

    const status = getInstanceStatus(asset, group);
    this.iconPath = SYNC_ICONS[status];
    this.description = status === 'modified' ? 'modified' : '';
    this.contextValue = `asset.${status}`;
    this.tooltip = `${asset.name} in ${asset.repoName}\nPath: ${asset.path}\nHash: ${displayHash(asset.hash)}`;
    this.command = {
      command: 'lcm.openFile',
      title: 'Open File',
      arguments: [asset],
    };
  }
}

/** A repo node in the By Repository view */
export class RepoItem extends vscode.TreeItem {
  constructor(
    public readonly repo: Repo,
  ) {
    super(repo.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('repo');
    this.description = `${repo.assets.length} asset${repo.assets.length !== 1 ? 's' : ''}`;
    this.contextValue = 'repo';
    this.tooltip = repo.path;
  }
}

/** An asset type category node within a repo (e.g. "Skills (2)") */
export class RepoAssetTypeItem extends vscode.TreeItem {
  constructor(
    public readonly assetType: AssetType,
    public readonly assets: Asset[],
    public readonly repo: Repo,
  ) {
    super(
      `${ASSET_TYPE_LABELS[assetType]} (${assets.length})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.iconPath = TYPE_ICONS[assetType];
    this.contextValue = 'repoAssetType';
  }
}

/** A single asset within a repo in the By Repository view */
export class RepoAssetItem extends vscode.TreeItem {
  constructor(
    public readonly asset: Asset,
    public readonly syncStatus?: SyncStatus,
  ) {
    super(asset.name, vscode.TreeItemCollapsibleState.None);

    this.iconPath = syncStatus ? SYNC_ICONS[syncStatus] : TYPE_ICONS[asset.type];
    this.contextValue = `asset.${syncStatus ?? 'unique'}`;
    this.tooltip = `Path: ${asset.path}\nHash: ${displayHash(asset.hash)}`;
    this.description = syncStatus === 'modified' ? 'modified' : syncStatus === 'synced' ? 'synced' : '';
    this.command = {
      command: 'lcm.openFile',
      title: 'Open File',
      arguments: [asset],
    };
  }
}
