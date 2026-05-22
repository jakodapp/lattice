import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, AssetType, ASSET_TYPE_DIRS, Repo } from '../types';
import { SETTINGS_JSON, SETTINGS_LOCAL_JSON, CLAUDE_MD, MCP_SERVERS_JSON, CONTEXT_DIRS } from '../constants';
import { hashDirectory, hashFile } from './hasher';
import { detectAgentsInRepo } from './agent-registry';
import { enumerateAssetDir as enumerateRaw } from './asset-enumerator';
import { expandHome } from './config';
import type { LatticeConfig } from './config';

/** Check if a path is a symlink and resolve its target */
async function detectSymlink(filePath: string): Promise<{ isSymlink: boolean; canonicalPath?: string }> {
  try {
    const stats = await fs.lstat(filePath);
    if (stats.isSymbolicLink()) {
      const target = await fs.readlink(filePath);
      const resolved = path.resolve(path.dirname(filePath), target);
      return { isSymlink: true, canonicalPath: resolved };
    }
  } catch { /* not a symlink */ }
  return { isSymlink: false };
}

export class Scanner {
  private ignoreDirs: Set<string>;
  private maxDepth: number;

  constructor(private config: LatticeConfig) {
    this.ignoreDirs = new Set(config.ignoreDirs);
    this.maxDepth = config.maxDepth;
  }

  /** Scan all configured roots and return discovered repos */
  async scan(): Promise<Repo[]> {
    const roots = this.config.roots;
    const repos: Repo[] = [];

    for (const root of roots) {
      const expandedRoot = expandHome(root);
      try {
        await this.scanDirectory(expandedRoot, 0, repos);
      } catch (err) {
        console.debug(`[LCM] Skipping root "${expandedRoot}":`, err instanceof Error ? err.message : err);
      }
    }

    repos.sort((a, b) => a.name.localeCompare(b.name));

    // Scan global ~/.claude/ if enabled
    if (this.config.scanGlobal) {
      const globalRepo = await this.buildGlobalRepo();
      if (globalRepo) { repos.unshift(globalRepo); }
    }

    // Scan canonical path (~/.assets/) for shared assets
    const canonicalRepo = await this.buildCanonicalRepo();
    if (canonicalRepo && canonicalRepo.assets.length > 0) {
      repos.unshift(canonicalRepo);
    }

    return repos;
  }

  /** Discover git repos without a context folder (.claude, .github, .cursor) */
  async discoverGitRepos(): Promise<Array<{ name: string; path: string }>> {
    const results: Array<{ name: string; path: string }> = [];
    for (const root of this.config.roots) {
      const expandedRoot = expandHome(root);
      try {
        await this.walkForGitOnly(expandedRoot, 0, expandedRoot, results);
      } catch {
        // skip inaccessible roots
      }
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  /** Walk directories looking for .git without any context folder */
  private async walkForGitOnly(
    dirPath: string,
    depth: number,
    root: string,
    results: Array<{ name: string; path: string }>,
  ): Promise<void> {
    if (depth > this.maxDepth) return;

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    const hasGitDir = entries.some(e => e.isDirectory() && e.name === '.git');
    const hasContextDir = entries.some(e => e.isDirectory() && CONTEXT_DIRS.has(e.name));

    if (hasGitDir && !hasContextDir) {
      const name = path.relative(root, dirPath) || path.basename(dirPath);
      results.push({ name, path: dirPath });
      return;
    }

    // If already a full repo (git + context), skip — it's handled by normal scan
    if (hasGitDir && hasContextDir) return;

    const subdirs = entries.filter(
      e => e.isDirectory() && !this.ignoreDirs.has(e.name) && !e.name.startsWith('.'),
    );
    await Promise.all(
      subdirs.map(e => this.walkForGitOnly(path.join(dirPath, e.name), depth + 1, root, results)),
    );
  }

  /** Build a special "Global" repo from ~/.claude/ */
  private async buildGlobalRepo(): Promise<Repo | null> {
    const home = process.env.HOME ?? '';
    if (!home) return null;
    const claudePath = path.join(home, '.claude');
    try {
      await fs.access(claudePath);
    } catch {
      return null;
    }
    const repo: Repo = {
      name: '~/.claude',
      path: home,
      claudePath,
      assets: [],
      isGlobal: true,
    };
    repo.assets = await this.enumerateAssets(repo);
    return repo;
  }

  /** Build a special "Canonical" repo from the configured canonical skills path */
  private async buildCanonicalRepo(): Promise<Repo | null> {
    const expanded = expandHome(this.config.canonicalPath);
    try {
      await fs.access(expanded);
    } catch {
      return null;
    }
    const repo: Repo = {
      name: '~/.assets (Canonical)',
      path: expanded,
      claudePath: expanded,
      assets: [],
      isCanonical: true,
    };
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(expanded, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (entry.name in ASSET_TYPE_DIRS) {
        const assetType = ASSET_TYPE_DIRS[entry.name];
        const innerAssets = await this.enumerateAssetDir(path.join(expanded, entry.name), assetType, repo.name);
        repo.assets.push(...innerAssets);
      } else {
        // Treat unrecognized directories as skills (backwards compat with flat canonical path)
        const hash = await hashDirectory(path.join(expanded, entry.name));
        repo.assets.push({
          name: entry.name,
          type: 'skill',
          path: path.join(expanded, entry.name),
          isDirectory: true,
          hash,
          repoName: repo.name,
        });
      }
    }
    return repo;
  }

  private async scanDirectory(dirPath: string, depth: number, repos: Repo[]): Promise<void> {
    if (depth > this.maxDepth) return;

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    const hasContextDir = entries.some(e => e.isDirectory() && CONTEXT_DIRS.has(e.name));
    const hasGitDir = entries.some(e => e.isDirectory() && e.name === '.git');
    if (hasContextDir && hasGitDir) {
      const repo = await this.buildRepo(dirPath);
      if (repo) {
        repos.push(repo);
      }
      return;
    }

    const subdirs = entries.filter(
      e => e.isDirectory() && !this.ignoreDirs.has(e.name) && !e.name.startsWith('.'),
    );
    await Promise.all(
      subdirs.map(e => this.scanDirectory(path.join(dirPath, e.name), depth + 1, repos)),
    );
  }

  private async buildRepo(repoPath: string): Promise<Repo | null> {
    const claudePath = path.join(repoPath, '.claude');
    const roots = this.config.roots;

    let name = path.basename(repoPath);
    for (const root of roots) {
      const expandedRoot = expandHome(root);
      if (repoPath.startsWith(expandedRoot)) {
        name = path.relative(expandedRoot, repoPath);
        break;
      }
    }

    const repo: Repo = {
      name,
      path: repoPath,
      claudePath,
      assets: [],
    };

    repo.assets = await this.enumerateAssets(repo);
    repo.agents = await detectAgentsInRepo(repoPath);
    return repo;
  }

  private async enumerateAssets(repo: Repo): Promise<Asset[]> {
    const assets: Asset[] = [];
    const claudePath = repo.claudePath;

    let claudeEntries: import('fs').Dirent[];
    try {
      claudeEntries = await fs.readdir(claudePath, { withFileTypes: true });
    } catch {
      return assets;
    }

    for (const entry of claudeEntries) {
      const fullPath = path.join(claudePath, entry.name);

      if (entry.isDirectory() && entry.name in ASSET_TYPE_DIRS) {
        const assetType = ASSET_TYPE_DIRS[entry.name];
        const innerAssets = await this.enumerateAssetDir(fullPath, assetType, repo.name);
        assets.push(...innerAssets);
        continue;
      }

      if (entry.isFile()) {
        if (entry.name === SETTINGS_JSON || entry.name === SETTINGS_LOCAL_JSON) {
          const hash = await hashFile(fullPath);
          assets.push({ name: entry.name, type: 'settings', path: fullPath, isDirectory: false, hash, repoName: repo.name });
        }
        if (entry.name === CLAUDE_MD) {
          const hash = await hashFile(fullPath);
          assets.push({ name: 'CLAUDE.md (.claude/)', type: 'claude-md', path: fullPath, isDirectory: false, hash, repoName: repo.name });
        }
        if (entry.name.endsWith('.mcp.json') || entry.name === MCP_SERVERS_JSON) {
          const hash = await hashFile(fullPath);
          assets.push({ name: entry.name, type: 'mcp-config', path: fullPath, isDirectory: false, hash, repoName: repo.name });
        }
      }
    }

    const rootClaudeMd = path.join(repo.path, CLAUDE_MD);
    try {
      await fs.access(rootClaudeMd);
      const hash = await hashFile(rootClaudeMd);
      assets.push({ name: 'CLAUDE.md (root)', type: 'claude-md', path: rootClaudeMd, isDirectory: false, hash, repoName: repo.name });
    } catch { /* not present */ }

    return assets;
  }

  /** Enumerate an asset-type directory, enriching each item with hash + symlink info */
  private async enumerateAssetDir(dirPath: string, assetType: AssetType, repoName: string): Promise<Asset[]> {
    const raw = await enumerateRaw(dirPath, assetType);
    const assets: Asset[] = [];

    for (const item of raw) {
      const hash = item.isDirectory ? await hashDirectory(item.fullPath) : await hashFile(item.fullPath);
      const sym = await detectSymlink(item.fullPath);
      assets.push({
        name: item.name,
        type: item.type,
        path: item.fullPath,
        isDirectory: item.isDirectory,
        hash,
        repoName,
        ...sym.isSymlink ? { isSymlink: true, canonicalPath: sym.canonicalPath } : {},
      });
    }

    return assets;
  }
}
