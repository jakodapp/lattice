import * as fs from 'fs/promises';
import * as path from 'path';
import { Asset, Repo } from '../types';
import { SKILL_MD, getErrorMessage } from '../constants';
import { getAgent } from './agent-defs';
import { getExportRule, ExportMethod, ExportRule, LATTICE_SOURCE_RE } from './agent-export-matrix';
import { createRelativeSymlink, isCanonicalSymlink } from './symlink-ops';
import { expandHome } from './config';
import type { OperationResult } from './result';

export interface ExportOutcome {
  agentId: string;
  targetPath: string;
  method: ExportMethod;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function exportViaSymlink(realSource: string, targetPath: string): Promise<void> {
  // Anchor the relative link in the parent's REAL path, or it breaks when the
  // parent dir itself sits behind a symlink (e.g. /var -> /private/var)
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const linkPath = path.join(await fs.realpath(path.dirname(targetPath)), path.basename(targetPath));
  if (await isCanonicalSymlink(linkPath, realSource)) return;
  // Guard before createRelativeSymlink — it would rm -rf whatever sits at the link path
  if (await pathExists(linkPath)) {
    throw new Error(`target already exists: ${targetPath}`);
  }
  const created = await createRelativeSymlink(realSource, linkPath);
  if (!created) {
    throw new Error(`could not create symlink at ${targetPath} (on Windows, enable Developer Mode)`);
  }
}

async function exportViaConvert(asset: Asset, rule: ExportRule, targetPath: string): Promise<void> {
  const sourceFile = asset.isDirectory ? path.join(asset.path, SKILL_MD) : asset.path;
  const content = await fs.readFile(sourceFile, 'utf8');
  if (await pathExists(targetPath)) {
    const existing = await fs.readFile(targetPath, 'utf8').catch(() => '');
    if (!LATTICE_SOURCE_RE.test(existing)) {
      throw new Error(`target already exists and is not Lattice-generated: ${targetPath}`);
    }
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, rule.convert!(content, asset.name, asset.path), 'utf8');
}

async function exportToAgent(asset: Asset, agentId: string, projectRepo?: Repo): Promise<ExportOutcome> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`unknown agent "${agentId}"`);
  const rule = getExportRule(agent, asset.type);
  if (!rule) throw new Error(`${agent.displayName} does not support ${asset.type} assets`);

  const base = projectRepo ? path.join(projectRepo.path, agent.configDir) : expandHome(agent.globalDir);
  const targetPath = path.join(base, rule.targetSubdir, rule.targetName(asset.name, path.basename(asset.path)));

  if (rule.method === 'symlink') {
    await exportViaSymlink(await fs.realpath(asset.path), targetPath);
  } else {
    await exportViaConvert(asset, rule, targetPath);
  }
  return { agentId, targetPath, method: rule.method };
}

/**
 * Export an asset to other agents' config layouts: symlink where the format is
 * compatible, convert where the target expects a different format.
 * Global-scope exports (no repo) write into each agent's global dir.
 */
export async function exportAssetToAgents(
  asset: Asset,
  scope: { repo?: Repo },
  targetAgentIds: string[],
): Promise<OperationResult<{ outcomes: ExportOutcome[] }>> {
  const outcomes: ExportOutcome[] = [];
  const errors: Array<{ target: string; error: string }> = [];

  for (const agentId of targetAgentIds) {
    try {
      outcomes.push(await exportToAgent(asset, agentId, scope.repo));
    } catch (err) {
      errors.push({ target: agentId, error: getErrorMessage(err) });
    }
  }

  if (outcomes.length === 0 && errors.length > 0) {
    return { ok: false, message: `Failed to export "${asset.name}": ${errors.map(e => `${e.target}: ${e.error}`).join(', ')}`, errors };
  }
  return {
    ok: true,
    data: { outcomes },
    message: `Exported "${asset.name}" to ${outcomes.map(o => o.agentId).join(', ')}.`,
    errors: errors.length > 0 ? errors : undefined,
  };
}
