import * as vscode from 'vscode';
import { Asset } from '../types';

export async function openFile(asset: Asset): Promise<void> {
  if (asset.isDirectory) {
    // For skill directories, open the SKILL.md if it exists, otherwise the directory
    const skillMd = vscode.Uri.file(`${asset.path}/SKILL.md`);
    try {
      await vscode.workspace.fs.stat(skillMd);
      await vscode.window.showTextDocument(skillMd);
    } catch {
      // No SKILL.md — open the directory in the explorer
      await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(asset.path));
    }
  } else {
    await vscode.window.showTextDocument(vscode.Uri.file(asset.path));
  }
}
