import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, TYPE_TO_DIR } from '../types';
import { getErrorMessage } from '../constants';
import { deleteAsset } from './file-ops';
import { createRelativeSymlink } from './symlink-ops';
import { expandHome } from './config';
import { CcmError } from '../errors';

export interface ConvertResult {
  canonicalPath: string;
  convertedRepos: string[];
  failedRepos: string[];
}

/**
 * Convert a copied asset to a canonical symlinked asset.
 *
 * 1. Copy the source version to the canonical path (~/.assets/<type-dir>/<name>)
 * 2. For each instance across repos: delete the copy, create a symlink to canonical
 * 3. Return which repos succeeded/failed
 */
export async function convertToSymlink(
  sourceAsset: Asset,
  allInstances: Asset[],
  canonicalBase: string,
): Promise<ConvertResult> {
  const expanded = expandHome(canonicalBase);

  // Determine canonical target path
  const typeDir = TYPE_TO_DIR[sourceAsset.type] ?? sourceAsset.type;
  const canonicalDir = path.join(expanded, typeDir);
  const canonicalPath = path.join(canonicalDir, path.basename(sourceAsset.path));

  // Create canonical directory
  await fs.mkdir(canonicalDir, { recursive: true });

  // Copy source to canonical path
  try {
    if (sourceAsset.isDirectory) {
      await fs.cp(sourceAsset.path, canonicalPath, { recursive: true });
    } else {
      await fs.copyFile(sourceAsset.path, canonicalPath);
    }
  } catch (err) {
    throw new CcmError(`Failed to copy to canonical path: ${getErrorMessage(err)}`, 'CONVERT_FAILED', {
      source: sourceAsset.path,
      target: canonicalPath,
    });
  }

  // Replace each instance with a symlink
  const convertedRepos: string[] = [];
  const failedRepos: string[] = [];

  for (const instance of allInstances) {
    try {
      await deleteAsset(instance);
      const created = await createRelativeSymlink(canonicalPath, instance.path);
      if (created) {
        convertedRepos.push(instance.repoName);
      } else {
        failedRepos.push(instance.repoName);
      }
    } catch {
      failedRepos.push(instance.repoName);
    }
  }

  return { canonicalPath, convertedRepos, failedRepos };
}
