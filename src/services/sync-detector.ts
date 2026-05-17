import { Asset, AssetGroup, AssetType, SyncStatus } from '../types';

/**
 * Groups assets by (type, name) across all repos and determines sync status.
 */
export function buildAssetGroups(allAssets: Asset[]): AssetGroup[] {
  const groupMap = new Map<string, AssetGroup>();

  for (const asset of allAssets) {
    const key = `${asset.type}::${asset.name}`;
    let group = groupMap.get(key);
    if (!group) {
      group = {
        name: asset.name,
        type: asset.type,
        instances: [],
        syncStatus: 'synced',
      };
      groupMap.set(key, group);
    }
    group.instances.push(asset);
  }

  // Determine sync status for each group
  for (const group of groupMap.values()) {
    if (group.instances.length <= 1) {
      group.syncStatus = 'synced';
    } else {
      const hashes = new Set(group.instances.map(i => i.hash));
      group.syncStatus = hashes.size === 1 ? 'synced' : 'diverged';
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Groups asset groups by their type.
 */
export function groupByType(groups: AssetGroup[]): Map<AssetType, AssetGroup[]> {
  const result = new Map<AssetType, AssetGroup[]>();
  for (const group of groups) {
    let list = result.get(group.type);
    if (!list) {
      list = [];
      result.set(group.type, list);
    }
    list.push(group);
  }
  return result;
}

/**
 * Determine the sync status of a single asset instance within its group.
 * - If there's only 1 instance, it's 'unique'
 * - If its hash matches the majority hash, it's 'synced'
 * - Otherwise it's 'modified'
 */
export function getInstanceStatus(asset: Asset, group: AssetGroup): SyncStatus {
  if (group.instances.length <= 1) {
    return 'unique';
  }

  // Find the majority hash
  const hashCounts = new Map<string, number>();
  for (const instance of group.instances) {
    hashCounts.set(instance.hash, (hashCounts.get(instance.hash) ?? 0) + 1);
  }

  let majorityHash = '';
  let maxCount = 0;
  for (const [hash, count] of hashCounts) {
    if (count > maxCount) {
      majorityHash = hash;
      maxCount = count;
    }
  }

  return asset.hash === majorityHash ? 'synced' : 'modified';
}
