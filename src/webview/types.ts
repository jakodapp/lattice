export type AssetType = 'skill' | 'command' | 'agent' | 'rule' | 'workflow' | 'script' | 'hook' | 'mcp-config' | 'output-style' | 'settings' | 'claude-md' | 'instructions';

export interface SerializedAsset {
  name: string;
  type: AssetType;
  path: string;
  isDirectory: boolean;
  hash: string;
  repoName: string;
  /** First ~200 chars of file content for preview */
  preview?: string;
  /** True if this asset is a symlink */
  isSymlink?: boolean;
  /** True if from the canonical path (not installed in a repo) */
  isCanonical?: boolean;
  /** Resolved symlink target (absolute), present when isSymlink */
  canonicalPath?: string;
  /** Agent tool this asset belongs to (e.g. 'cursor', 'codex', 'agents'); undefined = .claude */
  tool?: string;
  /** Tools whose global dirs hold this asset — set only by mergeGlobalAssets */
  mergedTools?: string[];
  /** Number of identical instances collapsed into this chip — set only by mergeGlobalAssets */
  mergedCount?: number;
}

export interface SerializedRepo {
  name: string;
  path: string;
  claudePath: string;
  assets: SerializedAsset[];
  isGlobal?: boolean;
  isCanonical?: boolean;
  agents?: string[];
}

export interface FileEntry {
  name: string;
  path: string;
  preview: string;
}

export interface FileGroup {
  label: string;
  entries: FileEntry[];
}

/** Discovered asset from a cloned GitHub repo */
export interface DiscoveredAssetSerialized {
  name: string;
  type: AssetType;
  sourcePath: string;
  isDirectory: boolean;
  preview: string;
}

/** Version option for the canonical version picker */
export interface VersionOption {
  repoName: string;
  path: string;
  hash: string;
  preview: string;
}

// Extension → Webview messages
export type ToWebview =
  | { type: 'init'; repos: SerializedRepo[]; view: ViewMode; currentRepo?: string; hasRoots: boolean; selectedAgent: string }
  | { type: 'refresh'; repos: SerializedRepo[]; hasRoots: boolean; selectedAgent: string }
  | { type: 'detail'; repo: SerializedRepo; fileGroups: FileGroup[]; claudeMdFiles: FileEntry[] }
  | { type: 'asset-preview'; asset: SerializedAsset; content: string }
  | { type: 'github-assets'; repoName: string; clonePath: string; sourceUrl: string; assets: DiscoveredAssetSerialized[] }
  | { type: 'version-pick'; assetName: string; assetPath: string; assetRepoName: string; versions: VersionOption[] }
  | { type: 'root-added'; rootPath: string }
  | { type: 'discovered-repos'; hiddenRepos: Array<{ name: string; path: string }>; uninitializedRepos: Array<{ name: string; path: string }> }
  | { type: 'update-status'; updates: Array<{ name: string; type: AssetType; remoteCommit: string }> };

// Webview → Extension messages
export type ToExtension =
  | { type: 'copy-asset'; assetPath: string; assetRepoName: string; targetRepoName: string }
  | { type: 'move-asset'; assetPath: string; assetRepoName: string; targetRepoName: string }
  | { type: 'delete-asset'; assetPath: string; repoName: string; viewContext?: 'repo' | 'type' }
  | { type: 'open-file'; assetPath: string }
  | { type: 'open-detail'; repoName: string }
  | { type: 'preview-asset'; assetPath: string }
  | { type: 'copy-asset-pick'; assetPath: string; assetRepoName: string }
  | { type: 'move-asset-pick'; assetPath: string; assetRepoName: string }
  | { type: 'copy-asset-to-repos'; assetPath: string; assetRepoName: string; targetRepoNames: string[] }
  | { type: 'move-asset-to-repo'; assetPath: string; assetRepoName: string; targetRepoName: string }
  | { type: 'install-canonical'; assetPath: string; targetRepoNames: string[] }
  | { type: 'delete-canonical'; assetPath: string }
  | { type: 'add-repo'; repoPath?: string }
  | { type: 'switch-view'; view: ViewMode }
  | { type: 'open-project'; repoPath: string }
  | { type: 'forget-repo'; repoName: string }
  | { type: 'open-sidebar' }
  | { type: 'refresh' }
  | { type: 'import-from-github' }
  | { type: 'install-github-assets'; clonePath: string; sourceUrl: string; assetPaths: string[]; targetRepoNames: string[] }
  | { type: 'cleanup-clone'; clonePath: string }
  | { type: 'diff-with'; assetPath: string; assetRepoName: string }
  | { type: 'convert-to-symlink'; assetPath: string; assetRepoName: string }
  | { type: 'convert-to-symlink-confirm'; assetPath: string; assetRepoName: string; sourceAssetPath: string }
  | { type: 'add-root'; rootPath: string }
  | { type: 'browse-root' }
  | { type: 'hide-repo'; repoPath: string }
  | { type: 'unhide-repo'; repoPath: string }
  | { type: 'discover-repos' }
  | { type: 'check-updates' }
  | { type: 'update-asset'; assetName: string; assetType: AssetType }
  | { type: 'export-to-agents'; assetPath: string; assetRepoName: string; targetAgentIds: string[] }
  | { type: 'set-agent'; agentId: string };

export type ViewMode = 'repo' | 'type';

// Imported for local use and re-exported for webview consumers
import { HIDDEN_ASSET_TYPES, UNREADABLE_HASH, findMajorityHash } from '../constants';
import { DEFAULT_TOOL } from '../services/agent-defs';
export { HIDDEN_ASSET_TYPES, UNREADABLE_HASH, findMajorityHash, DEFAULT_TOOL };

/**
 * Whether an asset is usable by the given agent — i.e. it lives in that
 * agent's config dir (or, for GLOBAL merged chips, any collapsed copy does).
 */
export function isAssetActiveForAgent(
  asset: Pick<SerializedAsset, 'tool' | 'mergedTools'>,
  agentId: string,
): boolean {
  if (asset.mergedTools) return asset.mergedTools.includes(agentId);
  return (asset.tool ?? DEFAULT_TOOL) === agentId;
}

/** Asset types that are unique per repo (no copy/install, only delete) */
export const CONTEXT_FILE_TYPES = new Set<string>(['claude-md', 'settings', 'mcp-config', 'instructions']);

/** Check if an asset is a context file (unique per repo, not copyable) */
export function isContextFile(asset: { type: string; path: string }): boolean {
  return CONTEXT_FILE_TYPES.has(asset.type) || asset.path.includes('/docs/');
}

/** Sentinel name for the single merged GLOBAL kanban column / detail view */
export const GLOBAL_MERGED_NAME = 'GLOBAL';

function groupByTypeAndName(assets: SerializedAsset[]): Map<string, SerializedAsset[]> {
  return assets.reduce((acc, a) => {
    const key = `${a.type}::${a.name}`;
    const list = acc.get(key) ?? [];
    list.push(a);
    acc.set(key, list);
    return acc;
  }, new Map<string, SerializedAsset[]>());
}

/** Cluster a group's instances by hash; unreadable assets never dedupe */
function clusterByHash(instances: SerializedAsset[]): SerializedAsset[][] {
  const clusters = new Map<string, SerializedAsset[]>();
  let unreadableSeq = 0;
  for (const inst of instances) {
    const key = inst.hash === UNREADABLE_HASH ? `${UNREADABLE_HASH}#${unreadableSeq++}` : inst.hash;
    const list = clusters.get(key) ?? [];
    list.push(inst);
    clusters.set(key, list);
  }
  return [...clusters.values()];
}

/** Prefer the non-symlink original; among symlinks, prefer links to external canonicals */
function pickRepresentative(cluster: SerializedAsset[], groupPaths: Set<string>): SerializedAsset {
  const sorted = [...cluster].sort((a, b) => a.repoName.localeCompare(b.repoName));
  return sorted.find(i => !i.isSymlink)
    ?? sorted.find(i => !i.canonicalPath || !groupPaths.has(i.canonicalPath))
    ?? sorted[0];
}

/**
 * Merge all global repos' assets into one deduplicated chip list:
 * identical-hash copies (and symlinks to them) collapse into one chip with
 * mergedTools/mergedCount; diverged copies stay as separate chips.
 */
export function mergeGlobalAssets(globalRepos: SerializedRepo[]): SerializedAsset[] {
  const all = globalRepos
    .filter(r => r.isGlobal)
    .flatMap(r => r.assets)
    .filter(a => !HIDDEN_ASSET_TYPES.has(a.type));

  return [...groupByTypeAndName(all).values()].flatMap(instances => {
    const groupPaths = new Set(instances.map(i => i.path));
    return clusterByHash(instances).map(cluster => ({
      ...pickRepresentative(cluster, groupPaths),
      mergedTools: [...new Set(cluster.map(i => i.tool ?? DEFAULT_TOOL))].sort(),
      mergedCount: cluster.length,
    }));
  });
}

/**
 * Compute set of asset paths that are diverged from the majority hash in their group.
 * Identical-hash copies across global dirs count as ONE vote (they render as one
 * merged chip), but every clustered member path is flagged when diverged.
 */
export function computeDivergedPaths(repos: SerializedRepo[]): Set<string> {
  const globalRepoNames = new Set(repos.filter(r => r.isGlobal).map(r => r.name));
  const groups = groupByTypeAndName(
    repos
      .filter(r => !r.isCanonical)
      .flatMap(r => r.assets)
      .filter(a => !HIDDEN_ASSET_TYPES.has(a.type)),
  );

  const result = new Set<string>();
  for (const instances of groups.values()) {
    if (instances.length <= 1) continue;
    const seenGlobalHashes = new Set<string>();
    const votes = instances
      .filter(inst => {
        if (!globalRepoNames.has(inst.repoName) || inst.hash === UNREADABLE_HASH) return true;
        if (seenGlobalHashes.has(inst.hash)) return false;
        seenGlobalHashes.add(inst.hash);
        return true;
      })
      .map(inst => inst.hash);
    const majority = findMajorityHash(votes);
    for (const inst of instances) {
      if (inst.hash === UNREADABLE_HASH || !majority || inst.hash !== majority) {
        result.add(inst.path);
      }
    }
  }
  return result;
}

/** Display order for asset types in pills and card sorting */
export const ASSET_TYPE_ORDER: AssetType[] = ['skill', 'agent', 'command', 'hook', 'rule', 'workflow', 'output-style', 'script'];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  'skill': 'Skills',
  'command': 'Commands',
  'agent': 'Agents',
  'rule': 'Rules',
  'workflow': 'Workflows',
  'script': 'Scripts',
  'hook': 'Hooks',
  'mcp-config': 'MCP Configs',
  'output-style': 'Output Styles',
  'settings': 'Settings',
  'claude-md': 'CLAUDE.md',
  'instructions': 'Instructions',
};
