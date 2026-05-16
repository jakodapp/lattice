import * as path from 'path';
import { Asset, Repo, TYPE_TO_DIR } from '../types';

/** Get the target path for an asset in a given repo (pure function, no side effects) */
export function getTargetPath(asset: Asset, targetRepo: Repo): string {
  // Root-level types go directly into .claude/ (or repo root for CLAUDE.md)
  if (asset.type === 'claude-md') {
    return asset.name.includes('root')
      ? path.join(targetRepo.path, 'CLAUDE.md')
      : path.join(targetRepo.claudePath, 'CLAUDE.md');
  }
  if (asset.type === 'settings' || asset.type === 'mcp-config') {
    return path.join(targetRepo.claudePath, path.basename(asset.path));
  }

  const dir = TYPE_TO_DIR[asset.type];
  if (!dir) {
    return path.join(targetRepo.claudePath, path.basename(asset.path));
  }
  return path.join(targetRepo.claudePath, dir, path.basename(asset.path));
}
