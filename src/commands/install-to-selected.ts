import * as vscode from 'vscode';
import { Asset } from '../types';
import { getErrorMessage } from '../constants';
import { copyAsset } from '../services/file-ops';
import type { ConfigStore } from '../extension';

export async function installToSelected(asset: Asset, store: ConfigStore): Promise<void> {
  const items = store.repos.map(r => {
    const hasAsset = r.assets.some(a => a.type === asset.type && a.name === asset.name);
    return {
      label: r.name,
      description: hasAsset ? '(already installed)' : '',
      picked: false,
      repo: r,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Install "${asset.name}" to which repos?`,
    canPickMany: true,
  });

  if (!selected || selected.length === 0) {return;}

  let successCount = 0;
  for (const item of selected) {
    try {
      await copyAsset(asset, item.repo);
      successCount++;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to install to ${item.label}: ${getErrorMessage(err)}`);
    }
  }

  vscode.window.showInformationMessage(`Installed "${asset.name}" to ${successCount} repo(s).`);
}
