import * as vscode from 'vscode';
import { Asset } from '../types';
import { getErrorMessage } from '../constants';
import { moveAsset } from '../services/file-ops';
import type { ConfigStore } from '../extension';

export async function moveToRepo(asset: Asset, store: ConfigStore): Promise<void> {
  const otherRepos = store.repos.filter(r => r.name !== asset.repoName);
  if (otherRepos.length === 0) {
    vscode.window.showInformationMessage('No other repos found to move to.');
    return;
  }

  const items = otherRepos.map(r => ({
    label: r.name,
    description: r.path,
    repo: r,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Move "${asset.name}" from ${asset.repoName} to...`,
  });

  if (!selected) {return;}

  const confirm = await vscode.window.showWarningMessage(
    `Move "${asset.name}" from ${asset.repoName} to ${selected.label}? This will delete it from ${asset.repoName}.`,
    { modal: true },
    'Move',
  );

  if (confirm !== 'Move') {return;}

  try {
    await moveAsset(asset, selected.repo);
    vscode.window.showInformationMessage(`Moved "${asset.name}" to ${selected.label}.`);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to move: ${getErrorMessage(err)}`);
  }
}
