import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, Repo } from '../types';
import { getErrorMessage } from '../constants';
import { CcmError } from '../errors';
import { getWriteTarget } from './path-resolver';
import type { AgentDef } from './agent-defs';
import type { OperationResult } from './result';

/** Copy an asset to a target repo, converting format when the agent requires it */
export async function copyAsset(asset: Asset, targetRepo: Repo, agent?: AgentDef): Promise<string> {
  const { targetPath, rule } = getWriteTarget(asset, targetRepo, agent);

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (asset.isDirectory) {
      await fs.cp(asset.path, targetPath, { recursive: true });
    } else if (rule?.method === 'convert' && rule.convert) {
      const content = await fs.readFile(asset.path, 'utf-8');
      await fs.writeFile(targetPath, rule.convert(content, asset.name, asset.path));
    } else {
      await fs.copyFile(asset.path, targetPath);
    }
  } catch (err) {
    throw new CcmError(
      `Failed to copy "${asset.name}" to ${targetRepo.name}: ${getErrorMessage(err)}`,
      'COPY_FAILED',
      { source: asset.path, target: targetPath },
    );
  }

  return targetPath;
}

/** Move an asset to a target repo (copy + delete source) */
export async function moveAsset(asset: Asset, targetRepo: Repo, agent?: AgentDef): Promise<string> {
  const targetPath = await copyAsset(asset, targetRepo, agent);
  await deleteAsset(asset);
  return targetPath;
}

/** Delete an asset from its repo */
export async function deleteAsset(asset: Asset): Promise<void> {
  try {
    if (asset.isDirectory) {
      await fs.rm(asset.path, { recursive: true, force: true });
    } else {
      await fs.unlink(asset.path);
    }
  } catch (err) {
    throw new CcmError(
      `Failed to delete "${asset.name}": ${getErrorMessage(err)}`,
      'DELETE_FAILED',
      { path: asset.path },
    );
  }
}

/** Copy an asset to multiple repos */
export async function copyAssetToMany(asset: Asset, targetRepos: Repo[]): Promise<OperationResult<{ successCount: number }>> {
  const results = await Promise.allSettled(
    targetRepos.map(repo => copyAsset(asset, repo)),
  );

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const errors = failures.map(f => ({
    target: 'repo',
    error: f.reason instanceof Error ? f.reason.message : 'Unknown error',
  }));

  if (failures.length > 0 && successCount === 0) {
    return { ok: false, message: `Failed to copy "${asset.name}": ${errors.map(e => e.error).join(', ')}`, errors };
  }

  return {
    ok: true,
    data: { successCount },
    message: successCount > 0 ? `Copied "${asset.name}" to ${successCount} repo(s).` : 'No repos to copy to.',
    errors: errors.length > 0 ? errors : undefined,
  };
}
