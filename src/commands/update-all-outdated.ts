import * as vscode from 'vscode';
import { Asset, AssetGroup } from '../types';
import { getErrorMessage, displayHash } from '../constants';
import { buildAssetGroups } from '../services/sync-detector';
import { copyAsset } from '../services/file-ops';
import type { ConfigStore } from '../extension';

export async function updateAllOutdated(groupOrAsset: AssetGroup | Asset, store: ConfigStore): Promise<void> {
  const allAssets = store.repos.flatMap(r => r.assets);
  const groups = buildAssetGroups(allAssets);

  // Determine which group we're working with
  let group: AssetGroup | undefined;
  if ('instances' in groupOrAsset) {
    group = groupOrAsset;
  } else {
    group = groups.find(g => g.type === groupOrAsset.type && g.name === groupOrAsset.name);
  }

  if (!group || group.instances.length < 2) {
    vscode.window.showInformationMessage('Nothing to update — asset exists in fewer than 2 repos.');
    return;
  }

  if (group.syncStatus === 'synced') {
    vscode.window.showInformationMessage(`All copies of "${group.name}" are already in sync.`);
    return;
  }

  // Let user pick the source version
  const items = group.instances.map(a => ({
    label: a.repoName,
    description: `hash: ${displayHash(a.hash)}`,
    asset: a,
  }));

  const source = await vscode.window.showQuickPick(items, {
    placeHolder: `Which version of "${group.name}" should be the source of truth?`,
  });

  if (!source) {return;}

  const targets = group.instances.filter(a => a.hash !== source.asset.hash);
  if (targets.length === 0) {
    vscode.window.showInformationMessage('All other copies already match this version.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Overwrite "${group.name}" in ${targets.length} repo(s) with the version from ${source.label}?`,
    { modal: true },
    'Update All',
  );

  if (confirm !== 'Update All') {return;}

  let successCount = 0;
  for (const target of targets) {
    const targetRepo = store.repos.find(r => r.name === target.repoName);
    if (!targetRepo) {continue;}
    try {
      await copyAsset(source.asset, targetRepo);
      successCount++;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to update ${target.repoName}: ${getErrorMessage(err)}`);
    }
  }

  vscode.window.showInformationMessage(`Updated "${group.name}" in ${successCount} repo(s).`);
}
