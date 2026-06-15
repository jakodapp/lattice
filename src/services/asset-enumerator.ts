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

const DEFAULT_EXTENSIONS = ['.md', '.js'];

/** Match a file name against accepted suffixes (longest first); returns the stripped name or undefined */
function matchExtension(fileName: string, extensions: string[]): string | undefined {
  const sorted = [...extensions].sort((a, b) => b.length - a.length);
  for (const ext of sorted) {
    if (fileName.toLowerCase().endsWith(ext.toLowerCase()) && fileName.length > ext.length) {
      return fileName.slice(0, -ext.length);
    }
  }
  return undefined;
}

/**
 * Walk an asset-type directory and yield discovered items.
 * Skills are identified by the presence of SKILL.md — directories without it
 * are treated as category folders and recursed into.
 * Non-skill directories recurse (e.g. rules can be nested).
 * Files must match one of the accepted extensions (default .md / .js).
 */
export async function enumerateAssetDir(
  dirPath: string,
  assetType: AssetType,
  maxDepth: number = 5,
  extensions: string[] = DEFAULT_EXTENSIONS,
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
        const nested = await enumerateAssetDir(fullPath, assetType, maxDepth - 1, extensions);
        items.push(...nested);
      }
    } else if (assetType !== 'skill' && (entry.isFile() || entry.isSymbolicLink())) {
      const name = matchExtension(entry.name, extensions);
      if (name !== undefined) {
        items.push({ name, type: assetType, fullPath, isDirectory: false });
      }
    }
  }

  return items;
}

