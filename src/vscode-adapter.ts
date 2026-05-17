import * as vscode from 'vscode';
import type { LatticeConfig, InstallMode } from './services/config';
import { DEFAULT_CONFIG } from './services/config';
import type { OperationResult } from './services/result';

/** Read LatticeConfig from vscode.workspace.getConfiguration */
export function readVscodeConfig(): LatticeConfig {
  const config = vscode.workspace.getConfiguration('latticeContextManager');
  return {
    roots: config.get<string[]>('roots', DEFAULT_CONFIG.roots),
    canonicalPath: config.get<string>('canonicalPath', DEFAULT_CONFIG.canonicalPath),
    maxDepth: config.get<number>('maxDepth', DEFAULT_CONFIG.maxDepth),
    ignoreDirs: config.get<string[]>('ignoreDirs', DEFAULT_CONFIG.ignoreDirs),
    scanGlobal: config.get<boolean>('scanGlobal', DEFAULT_CONFIG.scanGlobal),
    installMode: config.get<InstallMode>('installMode', DEFAULT_CONFIG.installMode),
  };
}

/** Show an OperationResult to the user via vscode.window notifications */
export function showResult(result: OperationResult<unknown>): void {
  if (result.ok) {
    vscode.window.showInformationMessage(result.message);
  } else {
    vscode.window.showErrorMessage(result.message);
  }
}
