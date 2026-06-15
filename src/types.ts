export const ASSET_TYPES = ['skill', 'agent', 'command', 'hook', 'rule', 'workflow', 'output-style', 'script', 'mcp-config', 'settings', 'claude-md', 'instructions'] as const;

export type AssetType = typeof ASSET_TYPES[number];

export type SyncStatus = 'synced' | 'modified' | 'unique';

export interface Repo {
  /** Display name, e.g. "Shappi/admin" */
  name: string;
  /** Absolute path to repo root */
  path: string;
  /** Absolute path to .claude/ directory */
  claudePath: string;
  assets: Asset[];
  /** True for the global ~/.claude/ scope */
  isGlobal?: boolean;
  /** True for the canonical ~/.assets path */
  isCanonical?: boolean;
  /** AI agents detected in this repo (e.g. ['claude', 'cursor', 'gemini']) */
  agents?: string[];
}

export interface Asset {
  /** Asset name, e.g. "audit", "mock-first" */
  name: string;
  type: AssetType;
  /** Absolute path to the file or directory */
  path: string;
  /** True for skills (directory with SKILL.md + supporting files) */
  isDirectory: boolean;
  /** SHA-256 content hash */
  hash: string;
  /** The repo this asset belongs to */
  repoName: string;
  /** True if this asset is a symlink to another location */
  isSymlink?: boolean;
  /** Resolved canonical path if symlinked */
  canonicalPath?: string;
  /** Agent tool this asset belongs to (e.g. 'cursor', 'codex', 'agents'); undefined = .claude */
  tool?: string;
}

export interface AssetGroup {
  name: string;
  type: AssetType;
  /** All instances of this asset across repos */
  instances: Asset[];
  /** Whether all instances have the same hash */
  syncStatus: 'synced' | 'diverged';
}

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

/**
 * Single source of truth: asset type ↔ directory name.
 * Access by type: ASSET_DIRS.skill → 'skills'
 * Access by dir:  ASSET_DIRS_REVERSE['skills'] → 'skill'
 */
const ASSET_DIR_ENTRIES = [
  ['skill', 'skills'],
  ['command', 'commands'],
  ['agent', 'agents'],
  ['rule', 'rules'],
  ['workflow', 'workflows'],
  ['script', 'scripts'],
  ['hook', 'hooks'],
  ['output-style', 'output-styles'],
] as const;

/** Type → directory name (for writing to disk) */
export const TYPE_TO_DIR: Partial<Record<AssetType, string>> =
  Object.fromEntries(ASSET_DIR_ENTRIES) as Partial<Record<AssetType, string>>;

/** Directory name → type (for reading from disk) */
export const ASSET_TYPE_DIRS: Record<string, AssetType> =
  Object.fromEntries(ASSET_DIR_ENTRIES.map(([t, d]) => [d, t])) as Record<string, AssetType>;

/** Paths of assets that are symlink targets of other assets in the same repo's list. */
export function buildSymlinkTargets(assets: Asset[]): Set<string> {
  return new Set(
    assets.filter(a => a.isSymlink && a.canonicalPath).map(a => a.canonicalPath!),
  );
}
