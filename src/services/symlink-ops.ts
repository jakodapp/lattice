import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, Repo } from '../types';
import { CcmError } from '../errors';
import { getWriteTarget } from './path-resolver';
import type { AgentDef } from './agent-defs';

import { expandHome } from './config';

export type InstallMode = 'copy' | 'symlink';

export interface InstallResult {
  mode: InstallMode;
  targetPath: string;
  canonicalPath?: string;
  symlinkFailed?: boolean;
}

/** Check if a path is within any of the configured canonical directories */
export function isCanonicalPath(assetPath: string, canonicalBases: string | string[]): boolean {
  const bases = Array.isArray(canonicalBases) ? canonicalBases : [canonicalBases];
  const resolvedAsset = path.resolve(assetPath);
  return bases.some(base => {
    const resolved = path.resolve(expandHome(base));
    return resolvedAsset.startsWith(resolved + path.sep) || resolvedAsset === resolved;
  });
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
 * Automatically decides the install strategy based on the source:
 * - Source is in a canonical directory → create symlink
 * - Otherwise → copy the files
 */
export async function installAsset(
  asset: Asset,
  targetRepo: Repo,
  options: { canonicalBase?: string | string[]; copyFn?: (a: Asset, r: Repo, agent?: AgentDef) => Promise<string>; agent?: AgentDef } = {},
): Promise<InstallResult> {
  const canonicalBases = options.canonicalBase
    ? (Array.isArray(options.canonicalBase) ? options.canonicalBase : [options.canonicalBase])
    : [];
  const { targetPath, rule } = getWriteTarget(asset, targetRepo, options.agent);
  if (!options.copyFn) {
    throw new CcmError('installAsset requires copyFn option', 'MISSING_COPY_FN', {});
  }
  const doCopy = options.copyFn;

  // Resolve canonical source — symlinked assets point back to their origin.
  // Convert-method targets (e.g. cursor .mdc) must copy-convert, never symlink raw content.
  const sourcePath = asset.canonicalPath ?? asset.path;
  const shouldSymlink = canonicalBases.length > 0
    && isCanonicalPath(sourcePath, canonicalBases)
    && rule?.method !== 'convert';

  if (!shouldSymlink) {
    await doCopy(asset, targetRepo, options.agent);
    return { mode: 'copy', targetPath };
  }

  // Check if target already has correct symlink
  if (await isCanonicalSymlink(targetPath, sourcePath)) {
    return { mode: 'symlink', targetPath, canonicalPath: sourcePath };
  }

  // Create symlink
  const created = await createRelativeSymlink(sourcePath, targetPath);
  if (created) {
    return { mode: 'symlink', targetPath, canonicalPath: sourcePath };
  }

  // Symlink failed — fall back to copy
  try {
    await doCopy(asset, targetRepo, options.agent);
    return { mode: 'copy', targetPath, symlinkFailed: true };
  } catch (err) {
    throw new CcmError(
      `Failed to install "${asset.name}": symlink failed, copy also failed: ${err instanceof Error ? err.message : String(err)}`,
      'SYMLINK_FAILED',
      { source: asset.path, target: targetPath },
    );
  }
}
