import * as vscode from 'vscode';
import { Repo } from '../types';

export class Watcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;
  private onChangeCallback: () => void;

  constructor(onChangeCallback: () => void) {
    this.onChangeCallback = onChangeCallback;
  }

  /** Set up watchers for all discovered repos */
  watchRepos(repos: Repo[]): void {
    this.disposeWatchers();

    for (const repo of repos) {
      const pattern = new vscode.RelativePattern(repo.claudePath, '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidChange(() => this.debouncedRefresh());
      watcher.onDidCreate(() => this.debouncedRefresh());
      watcher.onDidDelete(() => this.debouncedRefresh());

      this.watchers.push(watcher);
    }
  }

  private debouncedRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.onChangeCallback();
    }, 500);
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.disposeWatchers();
  }
}
