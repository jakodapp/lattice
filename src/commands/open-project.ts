import * as vscode from 'vscode';

export async function openProject(repoPath: string): Promise<void> {
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(repoPath), { forceNewWindow: true });
}
