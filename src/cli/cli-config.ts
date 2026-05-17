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

/** Save CLI config */
export async function saveCliConfig(config: LatticeConfig): Promise<void> {
  const latticeDir = getLatticeDir(config.canonicalPath);
  await fs.mkdir(latticeDir, { recursive: true });
  const configPath = path.join(latticeDir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
