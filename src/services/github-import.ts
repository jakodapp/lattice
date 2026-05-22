import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, AssetType, ASSET_TYPE_DIRS, Repo } from '../types';
import { hashFile, hashDirectory } from './hasher';
import { installAsset } from './symlink-ops';
import { copyAsset } from './file-ops';
import { enumerateAssetDir } from './asset-enumerator';
import { SKILL_MD } from '../constants';
import type { InstallMode } from './config';

export interface DiscoveredAsset {
  name: string;
  type: AssetType;
  sourcePath: string;
  isDirectory: boolean;
  preview: string;
}

/** Discover all .claude/ assets in a cloned repository.
 *  Also scans the repo root for asset-type directories (skills/, commands/, etc.)
 *  to support repos that ARE a context folder (e.g. anthropics/skills).
 *
 *  When `subpath` is provided (from a GitHub URL like /tree/master/skills/find-docs),
 *  discovery is scoped to that path — either a single skill or a container of skills.
 */
export async function discoverAssets(
  clonedRepoPath: string,
  subpath?: string,
): Promise<DiscoveredAsset[]> {
  if (subpath) {
    const scoped = await discoverAtSubpath(clonedRepoPath, subpath);
    if (scoped.length > 0) return scoped;
  }

  const assets: DiscoveredAsset[] = [];

  // 1. Scan .claude/ if it exists
  const claudePath = path.join(clonedRepoPath, '.claude');
  await scanAssetDirs(claudePath, assets);

  // 2. Scan root for repos that ARE a context folder (skills/, commands/, etc. at root)
  if (assets.length === 0) {
    await scanAssetDirs(clonedRepoPath, assets);
  }

  return assets;
}

/** Discover skills at a specific subpath within a cloned repo */
async function discoverAtSubpath(
  clonedRepoPath: string,
  subpath: string,
): Promise<DiscoveredAsset[]> {
  const targetPath = path.join(clonedRepoPath, subpath);

  // Case 1: subpath points directly to a skill (has SKILL.md)
  const skillMdPath = path.join(targetPath, SKILL_MD);
  try {
    await fs.access(skillMdPath);
    const preview = await readPreview(skillMdPath);
    const name = path.basename(targetPath);
    return [{ name, type: 'skill', sourcePath: targetPath, isDirectory: true, preview }];
  } catch { /* not a direct skill */ }

  // Case 2: subpath contains nested skills (recursively finds SKILL.md)
  const raw = await enumerateAssetDir(targetPath, 'skill');
  if (raw.length > 0) {
    const assets: DiscoveredAsset[] = [];
    for (const item of raw) {
      const preview = await readPreview(path.join(item.fullPath, SKILL_MD));
      assets.push({ name: item.name, type: item.type, sourcePath: item.fullPath, isDirectory: true, preview });
    }
    return assets;
  }

  // Case 3: subpath might contain other asset types
  const assets: DiscoveredAsset[] = [];
  await scanAssetDirs(targetPath, assets);
  return assets;
}

async function scanAssetDirs(basePath: string, assets: DiscoveredAsset[]): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(basePath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !(entry.name in ASSET_TYPE_DIRS)) continue;
    const assetType = ASSET_TYPE_DIRS[entry.name];
    const dirPath = path.join(basePath, entry.name);
    const raw = await enumerateAssetDir(dirPath, assetType);
    for (const item of raw) {
      const previewPath = item.isDirectory ? path.join(item.fullPath, SKILL_MD) : item.fullPath;
      const preview = await readPreview(previewPath);
      assets.push({ name: item.name, type: item.type, sourcePath: item.fullPath, isDirectory: item.isDirectory, preview });
    }
  }
}

async function readPreview(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.slice(0, 500);
  } catch {
    return '';
  }
}

/** Install selected discovered assets into target repos */
export async function installDiscoveredAssets(
  assets: DiscoveredAsset[],
  targetRepos: Repo[],
  options: { mode: InstallMode; canonicalBase: string },
): Promise<number> {
  let successCount = 0;

  for (const discovered of assets) {
    const tempAsset: Asset = {
      name: discovered.name,
      type: discovered.type,
      path: discovered.sourcePath,
      isDirectory: discovered.isDirectory,
      hash: discovered.isDirectory
        ? await hashDirectory(discovered.sourcePath)
        : await hashFile(discovered.sourcePath),
      repoName: '_github-import',
    };

    for (const repo of targetRepos) {
      try {
        await installAsset(tempAsset, repo, { mode: options.mode, canonicalBase: options.canonicalBase, copyFn: copyAsset });
        successCount++;
      } catch { /* continue with next */ }
    }
  }

  return successCount;
}
