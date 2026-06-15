import type { AssetType } from '../types';
import type { ContextAsset, ContextSource } from './context-store';
import { getRemoteHead } from './git-ops';

export interface AssetUpdate {
  name: string;
  type: AssetType;
  currentCommit: string;
  remoteCommit: string;
}

function sourceKey(source: ContextSource): string {
  return `${source.url}::${source.ref}`;
}

/**
 * Check GitHub-sourced assets for upstream changes.
 * One ls-remote per unique url+ref; failures are silently skipped
 * so an unreachable remote never blocks the dashboard.
 */
export async function checkForUpdates(assets: ContextAsset[]): Promise<AssetUpdate[]> {
  const sourced = assets.filter((a): a is ContextAsset & { source: ContextSource } => !!a.source);

  const uniqueSources = new Map<string, ContextSource>();
  for (const a of sourced) {
    uniqueSources.set(sourceKey(a.source), a.source);
  }

  const heads = new Map<string, string | undefined>();
  await Promise.all(
    [...uniqueSources.entries()].map(async ([key, source]) => {
      heads.set(key, await getRemoteHead(source.url, source.ref));
    }),
  );

  const updates: AssetUpdate[] = [];
  for (const asset of sourced) {
    const remoteCommit = heads.get(sourceKey(asset.source));
    if (!remoteCommit || remoteCommit === asset.source.commitHash) continue;
    updates.push({
      name: asset.name,
      type: asset.type,
      currentCommit: asset.source.commitHash,
      remoteCommit,
    });
  }
  return updates;
}
