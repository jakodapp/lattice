import * as fs from 'fs/promises';
import * as path from 'path';
import type { AssetType } from '../types';
import { THUMBS_DB } from '../constants';

/** Raw enumerated item — callers enrich with hashing, symlink detection, or previews */
export interface EnumeratedItem {
  name: string;
  type: AssetType;
  fullPath: string;
  isDirectory: boolean;
}

/**
 * Walk an asset-type directory and yield discovered items.
 * Skills are treated as single-directory assets.
 * Non-skill directories recurse (e.g. rules can be nested).
 * Files must end in .md or .js.
 */
export async function enumerateAssetDir(dirPath: string, assetType: AssetType): Promise<EnumeratedItem[]> {
  const items: EnumeratedItem[] = [];

  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return items;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === THUMBS_DB) continue;

    const fullPath = path.join(dirPath, entry.name);
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && await isSymlinkToDir(fullPath));

    if (isDir) {
      if (assetType === 'skill') {
        items.push({ name: entry.name, type: assetType, fullPath, isDirectory: true });
      } else {
        const nested = await enumerateAssetDir(fullPath, assetType);
        items.push(...nested);
      }
    } else if ((entry.isFile() || entry.isSymbolicLink()) && (entry.name.endsWith('.md') || entry.name.endsWith('.js'))) {
      const name = entry.name.replace(/\.(md|js)$/, '');
      items.push({ name, type: assetType, fullPath, isDirectory: false });
    }
  }

  return items;
}

async function isSymlinkToDir(fullPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(fullPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
