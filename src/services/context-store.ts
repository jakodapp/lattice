import * as fs from 'fs/promises';
import * as path from 'path';
import { ASSET_TYPES } from '../types';
import type { AssetType, Asset, Repo } from '../types';

/* ── Schema ─────────────────────────────────────────────────────────── */

export interface ContextInstallation {
  repoPath: string;
  repoName: string;
  mode: 'copy' | 'symlink';
  hash: string;
  synced: boolean;
}

export interface ContextSource {
  url: string;
  commitHash: string;
  ref: string;
  subpath?: string;
  fetchedAt: string;
}

export interface ContextAsset {
  name: string;
  type: AssetType;
  canonicalHash: string;
  modifiedAt: string;
  installations: ContextInstallation[];
  source?: ContextSource;
}

export interface ContextFile {
  version: 1;
  updatedAt: string;
  assets: ContextAsset[];
}

/* ── Service ────────────────────────────────────────────────────────── */

const CONTEXT_FILENAME = 'context.json';

/** Build a lookup key for an asset */
function assetKey(type: AssetType, name: string): string {
  return `${type}::${name}`;
}

/** Parse a lookup key back into typed components */
function parseAssetKey(key: string): { type: AssetType; name: string } {
  const sep = key.indexOf('::');
  const raw = key.slice(0, sep);
  const type = (ASSET_TYPES as readonly string[]).includes(raw) ? raw as AssetType : 'command' as AssetType;
  const name = key.slice(sep + 2);
  return { type, name };
}

/** Deep compare two installation arrays (order-independent) */
function installationsEqual(a: ContextInstallation[], b: ContextInstallation[]): boolean {
  if (a.length !== b.length) return false;
  const sortKey = (i: ContextInstallation) => `${i.repoPath}::${i.hash}::${i.mode}::${i.synced}`;
  const sortedA = a.map(sortKey).sort();
  const sortedB = b.map(sortKey).sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/** Index canonical repo assets by key */
function indexCanonicalAssets(repos: Repo[]): Map<string, Asset> {
  const canonicalRepo = repos.find(r => r.isCanonical);
  const map = new Map<string, Asset>();
  if (!canonicalRepo) return map;
  for (const a of canonicalRepo.assets) {
    map.set(assetKey(a.type, a.name), a);
  }
  return map;
}

/** Collect installations from scanned repos, grouped by asset key */
function collectScannedInstallations(
  repos: Repo[],
  canonicalAssets: Map<string, Asset>,
): Map<string, ContextInstallation[]> {
  const map = new Map<string, ContextInstallation[]>();
  for (const repo of repos) {
    for (const a of repo.assets) {
      const key = assetKey(a.type, a.name);
      const canonical = canonicalAssets.get(key);
      const list = map.get(key) ?? [];
      list.push({
        repoPath: repo.path,
        repoName: repo.name,
        mode: a.isSymlink ? 'symlink' : 'copy',
        hash: a.hash,
        synced: canonical ? a.hash === canonical.hash : true,
      });
      map.set(key, list);
    }
  }
  return map;
}

/** Merge preserved + fresh installations, sorted by repoPath */
function mergeInstallations(
  existing: ContextAsset | undefined,
  fresh: ContextInstallation[],
  scannedPaths: Set<string>,
  hasCanonical: boolean,
): ContextInstallation[] {
  const preserved = existing
    ? existing.installations.filter(i => !scannedPaths.has(i.repoPath))
    : [];
  const merged = [...preserved, ...fresh]
    .sort((a, b) => a.repoPath.localeCompare(b.repoPath));

  // For non-canonical assets, synced = all same hash
  if (!hasCanonical && merged.length > 0) {
    const refHash = merged[0].hash;
    for (const inst of merged) {
      inst.synced = inst.hash === refHash;
    }
  }

  return merged;
}

function emptyContext(): ContextFile {
  return { version: 1, updatedAt: new Date().toISOString(), assets: [] };
}

export class ContextStore {
  private context: ContextFile = emptyContext();
  private loadedSnapshot = '';
  private filePath: string;

  constructor(private latticeDir: string) {
    this.filePath = path.join(latticeDir, CONTEXT_FILENAME);
  }

  async load(): Promise<ContextFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.context = JSON.parse(raw) as ContextFile;
    } catch {
      this.context = emptyContext();
    }
    this.loadedSnapshot = this.contentSnapshot();
    return this.context;
  }

  /** Save only if assets actually changed since load */
  async save(): Promise<boolean> {
    const current = this.contentSnapshot();
    if (current === this.loadedSnapshot) return false;

    this.context.updatedAt = new Date().toISOString();
    await fs.mkdir(this.latticeDir, { recursive: true });
    const tmp = this.filePath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(this.context, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);
    this.loadedSnapshot = current;
    return true;
  }

  /** Snapshot of assets content (excluding updatedAt) for change detection */
  private contentSnapshot(): string {
    return JSON.stringify(this.context.assets);
  }

  get data(): ContextFile {
    return this.context;
  }

  /** Track or update an asset (upsert by name+type) */
  trackAsset(asset: ContextAsset): void {
    const idx = this.context.assets.findIndex(a => a.name === asset.name && a.type === asset.type);
    if (idx >= 0) {
      this.context.assets[idx] = asset;
    } else {
      this.context.assets.push(asset);
    }
  }

  /** Remove an asset from tracking */
  untrackAsset(name: string, type: AssetType): void {
    this.context.assets = this.context.assets.filter(a => !(a.name === name && a.type === type));
  }

  /** Update a single installation for a tracked asset */
  updateInstallation(name: string, type: AssetType, installation: ContextInstallation): void {
    const asset = this.context.assets.find(a => a.name === name && a.type === type);
    if (!asset) return;
    const idx = asset.installations.findIndex(i => i.repoPath === installation.repoPath);
    if (idx >= 0) {
      asset.installations[idx] = installation;
    } else {
      asset.installations.push(installation);
    }
  }

  /** Remove an installation from a tracked asset */
  removeInstallation(name: string, type: AssetType, repoPath: string): void {
    const asset = this.context.assets.find(a => a.name === name && a.type === type);
    if (!asset) return;
    asset.installations = asset.installations.filter(i => i.repoPath !== repoPath);
  }

  /**
   * Merge scan results into existing context.
   * Only updates assets found in this scan — preserves installations
   * from repos not included in this scan (different roots, different source).
   */
  buildFromScan(repos: Repo[], _canonicalPath: string): void {
    const normalRepos = repos.filter(r => !r.isCanonical && !r.isGlobal);
    const scannedPaths = new Set(normalRepos.map(r => r.path));
    const canonicalAssets = indexCanonicalAssets(repos);
    const scanned = collectScannedInstallations(normalRepos, canonicalAssets);
    const allKeys = new Set([...canonicalAssets.keys(), ...scanned.keys()]);

    for (const key of allKeys) {
      const { type, name } = parseAssetKey(key);
      const canonical = canonicalAssets.get(key);
      const existing = this.context.assets.find(a => a.name === name && a.type === type);
      const merged = mergeInstallations(existing, scanned.get(key) ?? [], scannedPaths, !!canonical);

      const newHash = canonical?.hash ?? merged[0]?.hash ?? '';
      const changed = !existing
        || existing.canonicalHash !== newHash
        || !installationsEqual(existing.installations, merged);

      this.trackAsset({
        name,
        type,
        canonicalHash: newHash,
        modifiedAt: changed ? new Date().toISOString() : existing?.modifiedAt ?? new Date().toISOString(),
        installations: merged,
        source: existing?.source,
      });
    }

    // Clean stale installations: for assets NOT in this scan, remove installations from scanned repos
    for (const asset of this.context.assets) {
      const key = assetKey(asset.type, asset.name);
      if (allKeys.has(key)) continue;
      const before = asset.installations.length;
      asset.installations = asset.installations.filter(i => !scannedPaths.has(i.repoPath));
      if (before !== asset.installations.length) {
        asset.modifiedAt = new Date().toISOString();
      }
    }
  }

  /** Get assets that have a GitHub source */
  getGitHubAssets(): ContextAsset[] {
    return this.context.assets.filter(a => a.source !== undefined);
  }
}
