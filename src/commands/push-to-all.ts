import * as vscode from 'vscode';
import { Asset } from '../types';
import { copyAssetToMany } from '../services/file-ops';
import type { ConfigStore } from '../extension';

export async function pushToAll(asset: Asset, store: ConfigStore): Promise<void> {
  // Find repos that don't already have this asset
  const reposWithAsset = new Set(
    store.repos
      .filter(r => r.assets.some(a => a.type === asset.type && a.name === asset.name))
      .map(r => r.name),
  );

  const targetRepos = store.repos.filter(r => !reposWithAsset.has(r.name));

  if (targetRepos.length === 0) {
    vscode.window.showInformationMessage(`"${asset.name}" already exists in all repos.`);
    return;
  }

  const confirm = await vscode.window.showInformationMessage(
    `Push "${asset.name}" to ${targetRepos.length} repo(s) that don't have it?`,
    { modal: true },
    'Push',
  );

  if (confirm !== 'Push') {return;}

  await copyAssetToMany(asset, targetRepos);
}
