import * as vscode from 'vscode';
import { ASSET_TYPES } from '../types';
import { groupByType } from '../services/sync-detector';
import { AssetGroupItem, AssetInstanceItem, AssetTypeItem } from './tree-items';
import type { ConfigStore } from '../extension';

export class ByTypeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
      return this.getRootItems();
    }
    if (element instanceof AssetTypeItem) {
      return element.groups.map(g => new AssetGroupItem(g));
    }
    if (element instanceof AssetGroupItem) {
      return element.group.instances.map(a => new AssetInstanceItem(a, element.group));
    }
    return [];
  }

  private getRootItems(): AssetTypeItem[] {
    const byType = groupByType(this.store.assetGroups);

    const items: AssetTypeItem[] = [];
    for (const type of ASSET_TYPES) {
      const typeGroups = byType.get(type);
      if (typeGroups && typeGroups.length > 0) {
        items.push(new AssetTypeItem(type, typeGroups));
      }
    }
    return items;
  }
}
