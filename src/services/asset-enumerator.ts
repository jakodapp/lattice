import * as fs from 'fs/promises';
import * as path from 'path';
import type { AssetType } from '../types';
import { SKILL_MD, THUMBS_DB } from '../constants';
import { isSymlinkToDir } from './fs-utils';

/** Raw enumerated item — callers enrich with hashing, symlink detection, or previews */
export interface EnumeratedItem {
  name: string;
  type: AssetType;
  fullPath: string;
  isDirectory: boolean;
}

/** Check whether a directory contains a SKILL.md file */
async function hasSkillMd(dirPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(dirPath, SKILL_MD));
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk an asset-type directory and yield discovered items.
 * Skills are identified by the presence of SKILL.md — directories without it
 * are treated as category folders and recursed into.
 * Non-skill directories recurse (e.g. rules can be nested).
 * Files must end in .md or .js.
 */
export async function enumerateAssetDir(
  dirPath: string,
  assetType: AssetType,
  maxDepth: number = 5,
): Promise<EnumeratedItem[]> {
  if (maxDepth <= 0) return [];

  const items: EnumeratedItem[] = [];

  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return items;
  }

  for (const entry of entries) {
    if (entry.name === THUMBS_DB) continue;

    const fullPath = path.join(dirPath, entry.name);
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && await isSymlinkToDir(fullPath));

    // Skip dotfiles; allow dot-prefixed directories when scanning skills (category folders like .curated/)
    if (entry.name.startsWith('.') && !(assetType === 'skill' && isDir)) continue;

    if (isDir) {
      if (assetType === 'skill' && await hasSkillMd(fullPath)) {
        items.push({ name: entry.name, type: assetType, fullPath, isDirectory: true });
      } else {
        const nested = await enumerateAssetDir(fullPath, assetType, maxDepth - 1);
        items.push(...nested);
      }
    } else if (assetType !== 'skill' && (entry.isFile() || entry.isSymbolicLink()) && (entry.name.endsWith('.md') || entry.name.endsWith('.js'))) {
      const name = entry.name.replace(/\.(md|js)$/, '');
      items.push({ name, type: assetType, fullPath, isDirectory: false });
    }
  }

  return items;
}
