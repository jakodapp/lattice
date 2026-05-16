import * as vscode from 'vscode';
import { Asset, AssetGroup } from '../types';
import { displayHash } from '../constants';
import { buildAssetGroups } from '../services/sync-detector';
import type { ConfigStore } from '../extension';

export async function diffWith(asset: Asset, store: ConfigStore): Promise<void> {
  const allAssets = store.repos.flatMap(r => r.assets);
  const groups = buildAssetGroups(allAssets);
  const group = groups.find(g => g.type === asset.type && g.name === asset.name);

  if (!group || group.instances.length < 2) {
    vscode.window.showInformationMessage(`"${asset.name}" only exists in one repo — nothing to diff.`);
    return;
  }

  // Filter out the current asset and let user pick which to compare with
  const others = group.instances.filter(a => a.path !== asset.path);
  const items = others.map(a => ({
    label: a.repoName,
    description: displayHash(a.hash),
    asset: a,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Diff "${asset.name}" (${asset.repoName}) with...`,
  });

  if (!selected) {return;}

  // For directories (skills), diff the SKILL.md files
  const leftUri = asset.isDirectory
    ? vscode.Uri.file(`${asset.path}/SKILL.md`)
    : vscode.Uri.file(asset.path);
  const rightUri = selected.asset.isDirectory
    ? vscode.Uri.file(`${selected.asset.path}/SKILL.md`)
    : vscode.Uri.file(selected.asset.path);

  const title = `${asset.name}: ${asset.repoName} ↔ ${selected.asset.repoName}`;
  await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
}
