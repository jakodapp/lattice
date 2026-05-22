import { Asset, Repo } from '../types';
import { getErrorMessage } from '../constants';
import { deleteAsset } from './file-ops';
import { installAsset } from './symlink-ops';
import { copyAsset } from './file-ops';
import { isContextFile } from '../webview/types';
import type { OperationResult } from './result';

interface DeleteWarning {
  action: string;
  label: string;
}

/** Pure function: compute the delete warning message based on asset context */
export function getDeleteWarning(opts: {
  assetName: string;
  repoName: string;
  isSymlink?: boolean;
  isContextFile: boolean;
  isAssetsView: boolean;
  instanceCount: number;
}): DeleteWarning {
  if (opts.isContextFile) {
    return {
      action: 'Delete permanently',
      label: `⚠ This is a unique context file "${opts.assetName}" in ${opts.repoName}.\n\nDeleting it will permanently remove this file. This action cannot be undone.`,
    };
  }
  if (opts.isAssetsView) {
    return {
      action: 'Delete permanently',
      label: opts.instanceCount > 0
        ? `⚠ Permanently delete "${opts.assetName}"?\n\nThis will remove it from ${opts.instanceCount} repo(s). This action cannot be undone.`
        : `⚠ Permanently delete "${opts.assetName}"?\n\nThis action cannot be undone.`,
    };
  }
  if (opts.isSymlink) {
    return {
      action: 'Remove',
      label: `Remove "${opts.assetName}" from ${opts.repoName}?\n\nThe original file will not be affected.`,
    };
  }
  if (opts.instanceCount <= 1) {
    return {
      action: 'Delete permanently',
      label: `⚠ This is the ONLY copy of "${opts.assetName}".\n\nDeleting it from ${opts.repoName} will permanently remove this asset. This action cannot be undone.`,
    };
  }
  return {
    action: 'Remove',
    label: `Remove "${opts.assetName}" from ${opts.repoName}?\n\nThis asset still exists in ${opts.instanceCount - 1} other repo(s).`,
  };
}

interface InstallOptions {
  canonicalBase: string | string[];
}

/** Install an asset to multiple repos, collecting results */
async function installToMultipleRepos(
  asset: Asset,
  targetRepos: Repo[],
  options: { canonicalBase: string | string[] },
  verb: string,
): Promise<OperationResult<{ successCount: number }>> {
  let successCount = 0;
  const errors: Array<{ target: string; error: string }> = [];
  for (const repo of targetRepos) {
    try {
      await installAsset(asset, repo, { ...options, copyFn: copyAsset });
      successCount++;
    } catch (err) {
      errors.push({ target: repo.name, error: getErrorMessage(err) });
    }
  }

  if (successCount === 0 && errors.length > 0) {
    return { ok: false, message: `Failed to ${verb} "${asset.name}": ${errors.map(e => `${e.target}: ${e.error}`).join(', ')}`, errors };
  }

  return {
    ok: true,
    data: { successCount },
    message: `${verb[0].toUpperCase()}${verb.slice(1)}d "${asset.name}" to ${successCount} repo(s).`,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/** Copy an asset to multiple repos via installAsset */
export function copyAssetToRepos(
  asset: Asset,
  targetRepos: Repo[],
  options: InstallOptions,
): Promise<OperationResult<{ successCount: number }>> {
  return installToMultipleRepos(asset, targetRepos, options, 'copy');
}

/** Move an asset to a target repo (install + delete source) */
export async function moveAssetToRepo(
  asset: Asset,
  targetRepo: Repo,
  options: InstallOptions,
): Promise<OperationResult> {
  await installAsset(asset, targetRepo, { ...options, copyFn: copyAsset });
  await deleteAsset(asset);
  return { ok: true, message: `Moved "${asset.name}" to ${targetRepo.name}.` };
}

/** Install a canonical asset to repos via symlink */
export function installCanonicalToRepos(
  asset: Asset,
  targetRepos: Repo[],
  canonicalBase: string | string[],
): Promise<OperationResult<{ successCount: number }>> {
  return installToMultipleRepos(asset, targetRepos, { canonicalBase }, 'install');
}

/** Find repos that have symlinks pointing to the given canonical asset */
export function findAffectedSymlinks(asset: Asset, allRepos: Repo[]): string[] {
  const affected: string[] = [];
  for (const repo of allRepos) {
    if (repo.isCanonical || repo.isGlobal) continue;
    for (const a of repo.assets) {
      if (a.isSymlink && a.canonicalPath === asset.path) {
        affected.push(repo.name);
        break;
      }
    }
  }
  return affected;
}

/** Delete a canonical asset and cascade-remove all symlinks pointing to it.
 *  Caller is responsible for confirmation UI before calling this. */
export async function deleteCanonicalAsset(
  asset: Asset,
  allRepos: Repo[],
): Promise<OperationResult> {
  // Remove symlinks first
  for (const repo of allRepos) {
    if (repo.isCanonical || repo.isGlobal) continue;
    for (const a of repo.assets) {
      if (a.isSymlink && a.canonicalPath === asset.path) {
        try { await deleteAsset(a); } catch (err) { console.debug(`[LCM] Best-effort symlink cleanup failed for ${a.path}:`, getErrorMessage(err)); }
      }
    }
  }

  await deleteAsset(asset);
  return { ok: true, message: `Deleted "${asset.name}" from canonical path.` };
}
