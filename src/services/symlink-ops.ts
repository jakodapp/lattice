import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, Repo } from '../types';
import { CcmError } from '../errors';
import { getTargetPath } from './path-resolver';

import { expandHome } from './config';
import type { InstallMode } from './config';

export interface InstallResult {
  mode: InstallMode;
  targetPath: string;
  canonicalPath?: string;
  symlinkFailed?: boolean;
}

/** Check if a path is within the configured canonical directory */
export function isCanonicalPath(assetPath: string, canonicalBase: string): boolean {
  const resolved = path.resolve(expandHome(canonicalBase));
  return path.resolve(assetPath).startsWith(resolved + path.sep) || path.resolve(assetPath) === resolved;
}

/** Check if a target path is already a symlink pointing to the expected canonical location */
export async function isCanonicalSymlink(targetPath: string, canonicalPath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(targetPath);
    if (!stats.isSymbolicLink()) return false;
    const linkTarget = await fs.readlink(targetPath);
    const resolved = path.resolve(path.dirname(targetPath), linkTarget);
    return resolved === path.resolve(canonicalPath);
  } catch {
    return false;
  }
}

/**
 * Create a relative symlink from linkPath -> targetPath.
 * Uses 'junction' on Windows for directory symlinks.
 * Returns true if symlink was created, false on failure.
 */
export async function createRelativeSymlink(targetPath: string, linkPath: string): Promise<boolean> {
  try {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedLink = path.resolve(linkPath);

    if (resolvedTarget === resolvedLink) return true;

    // Remove existing symlink or file at link location
    try {
      const stats = await fs.lstat(linkPath);
      if (stats.isSymbolicLink()) {
        const existing = await fs.readlink(linkPath);
        if (path.resolve(path.dirname(linkPath), existing) === resolvedTarget) return true;
        await fs.unlink(linkPath);
      } else {
        await fs.rm(linkPath, { recursive: true });
      }
    } catch {
      // Doesn't exist — fine
    }

    await fs.mkdir(path.dirname(linkPath), { recursive: true });

    const relativePath = path.relative(path.dirname(resolvedLink), resolvedTarget);
    const symlinkType = process.platform === 'win32' ? 'junction' : undefined;
    await fs.symlink(relativePath, linkPath, symlinkType);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install an asset to a target repo.
 *
 * If mode is 'symlink' AND the source asset lives in the canonical directory,
 * creates a symlink from target to source. Otherwise falls back to copy.
 *
 * If mode is 'copy', uses normal file copy (existing behavior).
 */
export async function installAsset(
  asset: Asset,
  targetRepo: Repo,
  options: { mode?: InstallMode; canonicalBase?: string; copyFn?: (a: Asset, r: Repo) => Promise<string> } = {},
): Promise<InstallResult> {
  const mode = options.mode ?? 'copy';
  const canonicalBase = options.canonicalBase ? expandHome(options.canonicalBase) : '';
  const targetPath = getTargetPath(asset, targetRepo);
  if (!options.copyFn) {
    throw new CcmError('installAsset requires copyFn option', 'MISSING_COPY_FN', {});
  }
  const doCopy = options.copyFn;

  // Copy mode — use existing behavior
  if (mode === 'copy') {
    await doCopy(asset, targetRepo);
    return { mode: 'copy', targetPath };
  }

  // Symlink mode — check if source is in canonical path
  if (!canonicalBase || !isCanonicalPath(asset.path, canonicalBase)) {
    // Source is not in canonical dir — fall back to copy
    await doCopy(asset, targetRepo);
    return { mode: 'copy', targetPath };
  }

  // Check if target already has correct symlink
  if (await isCanonicalSymlink(targetPath, asset.path)) {
    return { mode: 'symlink', targetPath, canonicalPath: asset.path };
  }

  // Create symlink
  const created = await createRelativeSymlink(asset.path, targetPath);
  if (created) {
    return { mode: 'symlink', targetPath, canonicalPath: asset.path };
  }

  // Symlink failed — fall back to copy
  try {
    await doCopy(asset, targetRepo);
    return { mode: 'copy', targetPath, symlinkFailed: true };
  } catch (err) {
    throw new CcmError(
      `Failed to install "${asset.name}": symlink failed, copy also failed: ${err instanceof Error ? err.message : String(err)}`,
      'SYMLINK_FAILED',
      { source: asset.path, target: targetPath },
    );
  }
}
