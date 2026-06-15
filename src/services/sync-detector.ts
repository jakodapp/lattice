import { Asset, AssetGroup, AssetType, SyncStatus } from '../types';
import { UNREADABLE_HASH, findMajorityHash } from '../constants';

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
      const readableHashes = new Set(
        group.instances.map(i => i.hash).filter(h => h !== UNREADABLE_HASH),
      );
      // All unreadable → diverged; one unique readable hash → synced; otherwise diverged
      group.syncStatus = readableHashes.size === 1 ? 'synced' : 'diverged';
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
 * - If its hash matches the majority hash (strictly highest count, no ties), it's 'synced'
 * - Unreadable assets are always 'modified'
 * - If there's a tie for the highest count, all instances are 'modified'
 */
export function getInstanceStatus(asset: Asset, group: AssetGroup): SyncStatus {
  if (group.instances.length <= 1) return 'unique';
  if (asset.hash === UNREADABLE_HASH) return 'modified';

  const majority = findMajorityHash(group.instances.map(i => i.hash));
  return majority && asset.hash === majority ? 'synced' : 'modified';
}
