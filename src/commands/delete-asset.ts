import * as vscode from 'vscode';
import { Asset } from '../types';
import { getErrorMessage } from '../constants';
import { deleteAsset as deleteAssetFromDisk } from '../services/file-ops';

export async function deleteAssetCommand(asset: Asset): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Delete "${asset.name}" from ${asset.repoName}? This cannot be undone.`,
    { modal: true },
    'Delete',
  );

  if (confirm !== 'Delete') {return;}

  try {
    await deleteAssetFromDisk(asset);
    vscode.window.showInformationMessage(`Deleted "${asset.name}" from ${asset.repoName}.`);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to delete: ${getErrorMessage(err)}`);
  }
}
