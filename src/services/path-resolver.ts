import * as path from 'path';
import { Asset, Repo, TYPE_TO_DIR } from '../types';
import { CcmError } from '../errors';
import { AgentDef, DEFAULT_TOOL } from './agent-defs';
import { getExportRule, isNonExportableType, ExportRule } from './agent-export-matrix';

export interface WriteTarget {
  targetPath: string;
  /** Present for non-claude agents; method 'convert' means content must be converted on copy */
  rule?: ExportRule;
}

/** Resolve where an asset lands under the .claude/ layout (or repo root for context files) */
function resolveDefaultTarget(asset: Asset, targetRepo: Repo): string {
  if (asset.type === 'claude-md') {
    return asset.name.includes('root')
      ? path.join(targetRepo.path, 'CLAUDE.md')
      : path.join(targetRepo.claudePath, 'CLAUDE.md');
  }
  if (asset.type === 'instructions') {
    return path.join(targetRepo.path, path.basename(asset.path));
  }
  if (asset.type === 'settings' || asset.type === 'mcp-config') {
    return path.join(targetRepo.claudePath, path.basename(asset.path));
  }
  const dir = TYPE_TO_DIR[asset.type];
  const base = targetRepo.claudePath;
  return dir
    ? path.join(base, dir, path.basename(asset.path))
    : path.join(base, path.basename(asset.path));
}

/**
 * Resolve where an asset lands in a target repo (pure function, no side effects).
 * When a non-default agent is given, the write targets that agent's config dir
 * using the export-rule matrix (subdir, rename, format conversion); context files,
 * global/canonical repos, and the default agent all use the `.claude/` layout.
 */
export function getWriteTarget(asset: Asset, targetRepo: Repo, agent?: AgentDef): WriteTarget {
  const agentScoped = agent && agent.id !== DEFAULT_TOOL
    && !targetRepo.isGlobal && !targetRepo.isCanonical
    && !isNonExportableType(asset.type);
  if (!agentScoped) {
    return { targetPath: resolveDefaultTarget(asset, targetRepo) };
  }

  const rule = getExportRule(agent, asset.type);
  if (!rule) {
    throw new CcmError(
      `${agent.displayName} does not support ${asset.type} assets`,
      'AGENT_TYPE_UNSUPPORTED',
      { agentId: agent.id, assetType: asset.type },
    );
  }
  return {
    targetPath: path.join(
      targetRepo.path,
      agent.configDir,
      rule.targetSubdir,
      rule.targetName(asset.name, path.basename(asset.path)),
    ),
    rule,
  };
}
