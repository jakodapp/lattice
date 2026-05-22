import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, AssetType, ASSET_TYPE_DIRS, Repo } from '../types';
import { SETTINGS_JSON, SETTINGS_LOCAL_JSON, CLAUDE_MD, MCP_SERVERS_JSON, CONTEXT_DIRS } from '../constants';
import { hashDirectory, hashFile } from './hasher';
import { detectAgentsInRepo } from './agent-registry';
import { enumerateAssetDir as enumerateRaw } from './asset-enumerator';
import { isDirEntry, isFileEntry } from './fs-utils';
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

    // Scan global paths (~/.claude, ~/.cursor, ~/.github, etc.)
    const globalRepos = await this.buildGlobalRepos();
    for (const gr of globalRepos.reverse()) {
      repos.unshift(gr);
    }

    // Scan canonical paths (~/.assets/, ~/.agents/, etc.) for shared assets
    const canonicalRepos = await this.buildCanonicalRepos();
    for (const cr of canonicalRepos.reverse()) {
      repos.unshift(cr);
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

    let hasGitDir = entries.some(e => e.isDirectory() && e.name === '.git');
    let hasContextDir = entries.some(e => e.isDirectory() && CONTEXT_DIRS.has(e.name));

    if (!hasGitDir || !hasContextDir) {
      for (const e of entries) {
        if (!e.isSymbolicLink()) continue;
        const ep = path.join(dirPath, e.name);
        if (!hasGitDir && e.name === '.git' && await isDirEntry(ep, e)) hasGitDir = true;
        if (!hasContextDir && CONTEXT_DIRS.has(e.name) && await isDirEntry(ep, e)) hasContextDir = true;
        if (hasGitDir && hasContextDir) break;
      }
    }

    if (hasGitDir && !hasContextDir) {
      const name = path.relative(root, dirPath) || path.basename(dirPath);
      results.push({ name, path: dirPath });
      return;
    }

    // If already a full repo (git + context), skip — it's handled by normal scan
    if (hasGitDir && hasContextDir) return;

    const subdirs: import('fs').Dirent[] = [];
    for (const e of entries) {
      if (this.ignoreDirs.has(e.name) || e.name.startsWith('.')) continue;
      if (await isDirEntry(path.join(dirPath, e.name), e)) subdirs.push(e);
    }
    await Promise.all(
      subdirs.map(e => this.walkForGitOnly(path.join(dirPath, e.name), depth + 1, root, results)),
    );
  }

  /** Build global repos from all configured global paths */
  private async buildGlobalRepos(): Promise<Repo[]> {
    const home = process.env.HOME ?? '';
    if (!home) return [];
    const results: Repo[] = [];
    for (const globalPath of this.config.globalPaths) {
      const expanded = expandHome(globalPath);
      try {
        await fs.access(expanded);
      } catch {
        continue;
      }
      const repo: Repo = {
        name: globalPath,
        path: home,
        claudePath: expanded,
        assets: [],
        isGlobal: true,
      };
      repo.assets = await this.enumerateAssets(repo);
      if (repo.assets.length > 0) {
        results.push(repo);
      }
    }
    return results;
  }

  /** Build canonical repos from all configured canonical paths */
  private async buildCanonicalRepos(): Promise<Repo[]> {
    const results: Repo[] = [];
    for (const canonicalPath of this.config.canonicalPaths) {
      const expanded = expandHome(canonicalPath);
      try {
        await fs.access(expanded);
      } catch {
        continue;
      }
      const repo: Repo = {
        name: `${canonicalPath} (Canonical)`,
        path: expanded,
        claudePath: expanded,
        assets: [],
        isCanonical: true,
      };
      let entries: import('fs').Dirent[];
      try {
        entries = await fs.readdir(expanded, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const entryPath = path.join(expanded, entry.name);
        if (!await isDirEntry(entryPath, entry)) continue;
        if (entry.name in ASSET_TYPE_DIRS) {
          const assetType = ASSET_TYPE_DIRS[entry.name];
          const innerAssets = await this.enumerateAssetDir(entryPath, assetType, repo.name);
          repo.assets.push(...innerAssets);
        } else {
          // Treat unrecognized directories as skills (backwards compat with flat canonical path)
          const hash = await hashDirectory(entryPath);
          repo.assets.push({
            name: entry.name,
            type: 'skill',
            path: entryPath,
            isDirectory: true,
            hash,
            repoName: repo.name,
          });
        }
      }
      if (repo.assets.length > 0) {
        results.push(repo);
      }
    }
    return results;
  }

  private async scanDirectory(dirPath: string, depth: number, repos: Repo[]): Promise<void> {
    if (depth > this.maxDepth) return;

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    let hasContextDir = entries.some(e => e.isDirectory() && CONTEXT_DIRS.has(e.name));
    let hasGitDir = entries.some(e => e.isDirectory() && e.name === '.git');

    if (!hasContextDir || !hasGitDir) {
      for (const e of entries) {
        if (!e.isSymbolicLink()) continue;
        const ep = path.join(dirPath, e.name);
        if (!hasContextDir && CONTEXT_DIRS.has(e.name) && await isDirEntry(ep, e)) hasContextDir = true;
        if (!hasGitDir && e.name === '.git' && await isDirEntry(ep, e)) hasGitDir = true;
        if (hasContextDir && hasGitDir) break;
      }
    }

    if (hasContextDir && hasGitDir) {
      const repo = await this.buildRepo(dirPath);
      if (repo) {
        repos.push(repo);
      }
      return;
    }

    const subdirs: import('fs').Dirent[] = [];
    for (const e of entries) {
      if (this.ignoreDirs.has(e.name) || e.name.startsWith('.')) continue;
      if (await isDirEntry(path.join(dirPath, e.name), e)) subdirs.push(e);
    }
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

      if (await isDirEntry(fullPath, entry) && entry.name in ASSET_TYPE_DIRS) {
        const assetType = ASSET_TYPE_DIRS[entry.name];
        const innerAssets = await this.enumerateAssetDir(fullPath, assetType, repo.name);
        assets.push(...innerAssets);
        continue;
      }

      if (await isFileEntry(fullPath, entry)) {
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
