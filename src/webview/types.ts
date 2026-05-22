export type AssetType = 'skill' | 'command' | 'agent' | 'rule' | 'script' | 'hook' | 'mcp-config' | 'output-style' | 'settings' | 'claude-md';

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
  | { type: 'init'; repos: SerializedRepo[]; view: ViewMode; currentRepo?: string; hasRoots: boolean }
  | { type: 'refresh'; repos: SerializedRepo[]; hasRoots: boolean }
  | { type: 'detail'; repo: SerializedRepo; fileGroups: FileGroup[]; claudeMdFiles: FileEntry[] }
  | { type: 'asset-preview'; asset: SerializedAsset; content: string }
  | { type: 'github-assets'; repoName: string; clonePath: string; sourceUrl: string; assets: DiscoveredAssetSerialized[] }
  | { type: 'version-pick'; assetName: string; assetPath: string; assetRepoName: string; versions: VersionOption[] }
  | { type: 'root-added'; rootPath: string }
  | { type: 'discovered-repos'; hiddenRepos: Array<{ name: string; path: string }>; uninitializedRepos: Array<{ name: string; path: string }> };

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
  | { type: 'discover-repos' };

export type ViewMode = 'repo' | 'type';

// Re-exported from shared constants for webview access
export { HIDDEN_ASSET_TYPES } from '../constants';

/** Asset types that are unique per repo (no copy/install, only delete) */
export const CONTEXT_FILE_TYPES = new Set<string>(['claude-md', 'settings', 'mcp-config']);

/** Check if an asset is a context file (unique per repo, not copyable) */
export function isContextFile(asset: { type: string; path: string }): boolean {
  return CONTEXT_FILE_TYPES.has(asset.type) || asset.path.includes('/docs/');
}

/** Display order for asset types in pills and card sorting */
export const ASSET_TYPE_ORDER: AssetType[] = ['skill', 'agent', 'command', 'hook', 'rule', 'output-style', 'script'];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  'skill': 'Skills',
  'command': 'Commands',
  'agent': 'Agents',
  'rule': 'Rules',
  'script': 'Scripts',
  'hook': 'Hooks',
  'mcp-config': 'MCP Configs',
  'output-style': 'Output Styles',
  'settings': 'Settings',
  'claude-md': 'CLAUDE.md',
};
