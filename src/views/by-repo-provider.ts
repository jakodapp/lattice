import * as vscode from 'vscode';
import { Asset, ASSET_TYPES, AssetType, Repo } from '../types';
import { getInstanceStatus } from '../services/sync-detector';
import { RepoAssetItem, RepoAssetTypeItem, RepoItem } from './tree-items';
import type { ConfigStore } from '../extension';

export class ByRepoProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private store: ConfigStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      return this.store.repos.map(r => new RepoItem(r));
    }
    if (element instanceof RepoItem) {
      return this.getRepoChildren(element.repo);
    }
    if (element instanceof RepoAssetTypeItem) {
      return this.getAssetItems(element.assets);
    }
    return [];
  }

  private getRepoChildren(repo: Repo): RepoAssetTypeItem[] {
    // Group assets by type
    const byType = new Map<AssetType, Asset[]>();
    for (const asset of repo.assets) {
      let list = byType.get(asset.type);
      if (!list) {
        list = [];
        byType.set(asset.type, list);
      }
      list.push(asset);
    }

    const items: RepoAssetTypeItem[] = [];
    for (const type of ASSET_TYPES) {
      const assets = byType.get(type);
      if (assets && assets.length > 0) {
        items.push(new RepoAssetTypeItem(type, assets, repo));
      }
    }
    return items;
  }

  private getAssetItems(assets: Asset[]): RepoAssetItem[] {
    const groupMap = new Map(this.store.assetGroups.map(g => [`${g.type}::${g.name}`, g]));

    return assets.map(asset => {
      const group = groupMap.get(`${asset.type}::${asset.name}`);
      const status = group ? getInstanceStatus(asset, group) : 'unique';
      return new RepoAssetItem(asset, status);
    });
  }
}
