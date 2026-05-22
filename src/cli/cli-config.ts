import * as fs from 'fs/promises';
import * as path from 'path';
import { expandHome, DEFAULT_CONFIG } from '../services/config';
import type { LatticeConfig } from '../services/config';

/** Resolve the .lattice directory path from the canonical path */
export function getLatticeDir(canonicalPath: string): string {
  return path.join(expandHome(canonicalPath), '.lattice');
}

/**
 * Load CLI config. Checks LATTICE_CONFIG env var first (for testing),
 * then falls back to ~/.assets/.lattice/config.json.
 */
export async function loadCliConfig(): Promise<LatticeConfig> {
  const envConfig = process.env.LATTICE_CONFIG;
  const configPath = envConfig ?? path.join(getLatticeDir(DEFAULT_CONFIG.canonicalPath), 'config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LatticeConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Merge incoming config with existing on-disk config, preserving lattice-managed
 * fields (hiddenRepos) unless the caller explicitly changed them from default.
 */
export function mergeLatticeConfig(
  incoming: LatticeConfig,
  existing: Partial<LatticeConfig>,
): LatticeConfig {
  return {
    ...incoming,
    // Preserve on-disk hiddenRepos when incoming has the default value (empty array).
    // Callers that intentionally modify hiddenRepos pass the modified array, which
    // differs from default and is kept as-is.
    hiddenRepos: existing.hiddenRepos !== undefined && incoming.hiddenRepos.length === 0
      ? existing.hiddenRepos
      : incoming.hiddenRepos,
  };
}

/** Save CLI config, preserving lattice-managed fields from existing file */
export async function saveCliConfig(config: LatticeConfig): Promise<void> {
  const latticeDir = getLatticeDir(config.canonicalPath);
  await fs.mkdir(latticeDir, { recursive: true });
  const configPath = path.join(latticeDir, 'config.json');

  let existing: Partial<LatticeConfig> = {};
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    existing = JSON.parse(raw) as Partial<LatticeConfig>;
  } catch { /* file doesn't exist yet */ }

  const merged = mergeLatticeConfig(config, existing);
  await fs.writeFile(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

/** Write config directly without re-reading/merging. Use when the caller
 *  has already loaded and modified the config (e.g. ensureLatticeStore). */
export async function writeCliConfigDirect(config: LatticeConfig): Promise<void> {
  const latticeDir = getLatticeDir(config.canonicalPath);
  await fs.mkdir(latticeDir, { recursive: true });
  const configPath = path.join(latticeDir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
