import * as vscode from 'vscode';
import type { LatticeConfig } from './services/config';
import { DEFAULT_CONFIG } from './services/config';
import type { OperationResult } from './services/result';

/** Read LatticeConfig from vscode.workspace.getConfiguration */
export function readVscodeConfig(): LatticeConfig {
  const config = vscode.workspace.getConfiguration('latticeContextManager');
  return {
    roots: config.get<string[]>('roots', DEFAULT_CONFIG.roots),
    canonicalPaths: config.get<string[]>('canonicalPaths', DEFAULT_CONFIG.canonicalPaths),
    globalPaths: config.get<string[]>('globalPaths', DEFAULT_CONFIG.globalPaths),
    maxDepth: config.get<number>('maxDepth', DEFAULT_CONFIG.maxDepth),
    ignoreDirs: config.get<string[]>('ignoreDirs', DEFAULT_CONFIG.ignoreDirs),
    hiddenRepos: DEFAULT_CONFIG.hiddenRepos,
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
