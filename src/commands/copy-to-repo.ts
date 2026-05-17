import * as vscode from 'vscode';
import { Asset } from '../types';
import { getErrorMessage } from '../constants';
import { copyAsset } from '../services/file-ops';
import type { ConfigStore } from '../extension';

export async function copyToRepo(asset: Asset, store: ConfigStore): Promise<void> {
  const otherRepos = store.repos.filter(r => r.name !== asset.repoName);
  if (otherRepos.length === 0) {
    vscode.window.showInformationMessage('No other repos found to copy to.');
    return;
  }

  const items = otherRepos.map(r => ({
    label: r.name,
    description: r.path,
    picked: false,
    repo: r,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Copy "${asset.name}" to which repo(s)?`,
    canPickMany: true,
  });

  if (!selected || selected.length === 0) {return;}

  for (const item of selected) {
    try {
      await copyAsset(asset, item.repo);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to copy to ${item.label}: ${getErrorMessage(err)}`);
    }
  }

  vscode.window.showInformationMessage(`Copied "${asset.name}" to ${selected.length} repo(s).`);
}
