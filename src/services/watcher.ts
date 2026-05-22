import * as vscode from 'vscode';
import * as path from 'path';
import { Repo } from '../types';

/** Directories inside ~/.claude/ that are NOT asset-related (Claude Code internals) */
const GLOBAL_EXCLUDE_DIRS = new Set([
  'projects', 'memory', 'todos', 'statsig', 'conversations',
  '.credentials', 'analytics', 'tune', 'ide',
]);

/** Directories inside ~/.assets/ (canonical) that are internal bookkeeping */
const CANONICAL_EXCLUDE_DIRS = new Set(['.lattice', '.git']);

const DEBOUNCE_MS = 2000;

interface WatcherEntry {
  watcher: vscode.FileSystemWatcher;
  isGlobal: boolean;
  isCanonical: boolean;
  claudePath: string;
}

export class Watcher implements vscode.Disposable {
  private entries = new Map<string, WatcherEntry>();
  private debounceTimer: NodeJS.Timeout | undefined;
  private onChangeCallback: () => void;

  constructor(onChangeCallback: () => void) {
    this.onChangeCallback = onChangeCallback;
  }

  /** Reconcile watchers: add new repos, remove stale ones, keep existing */
  watchRepos(repos: Repo[]): void {
    const incoming = new Map(repos.map(r => [r.claudePath, r]));

    // Remove watchers for repos no longer in the scan
    for (const [key, entry] of this.entries) {
      if (!incoming.has(key)) {
        entry.watcher.dispose();
        this.entries.delete(key);
      }
    }

    // Add watchers only for repos we aren't already watching
    for (const repo of repos) {
      if (this.entries.has(repo.claudePath)) { continue; }

      const pattern = new vscode.RelativePattern(repo.claudePath, '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const isGlobal = !!repo.isGlobal;
      const isCanonical = !!repo.isCanonical;
      const claudePath = repo.claudePath;

      const handler = (uri: vscode.Uri) => {
        if (this.shouldIgnore(uri, claudePath, isGlobal, isCanonical)) { return; }
        this.debouncedRefresh();
      };

      watcher.onDidChange(handler);
      watcher.onDidCreate(handler);
      watcher.onDidDelete(handler);

      this.entries.set(repo.claudePath, { watcher, isGlobal, isCanonical, claudePath });
    }
  }

  private shouldIgnore(
    uri: vscode.Uri,
    claudePath: string,
    isGlobal: boolean,
    isCanonical: boolean,
  ): boolean {
    if (!isGlobal && !isCanonical) { return false; }

    const relative = path.relative(claudePath, uri.fsPath);
    const topDir = relative.split(path.sep)[0];

    if (isGlobal && GLOBAL_EXCLUDE_DIRS.has(topDir)) { return true; }
    if (isCanonical && CANONICAL_EXCLUDE_DIRS.has(topDir)) { return true; }

    return false;
  }

  private debouncedRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.onChangeCallback();
    }, DEBOUNCE_MS);
  }

  private disposeWatchers(): void {
    for (const entry of this.entries.values()) {
      entry.watcher.dispose();
    }
    this.entries.clear();
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.disposeWatchers();
  }
}
