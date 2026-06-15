import { AGENT_REGISTRY, AgentDef, AssetDirMapping, DEFAULT_TOOL } from './agent-defs';
import type { AssetType } from '../types';
import type { SerializedAsset, SerializedRepo } from '../webview/types';

// Pure module — imported by both the extension and the webview bundle.
// Must never touch fs/vscode.

export type ExportMethod = 'symlink' | 'convert';

export interface ExportRule {
  method: ExportMethod;
  /** Subdir under the agent config dir; '' = config dir root (cline rules) */
  targetSubdir: string;
  /** Link/file name derived from the asset name and the source basename */
  targetName: (assetName: string, sourceBasename: string) => string;
  /** Required for method 'convert' */
  convert?: (content: string, assetName: string, sourcePath: string) => string;
}

export interface ExportTarget {
  agentId: string;
  displayName: string;
  compatible: boolean;
  method?: ExportMethod;
  /** Shown when incompatible */
  reason?: string;
  /** Same name+type already present under this agent's dirs */
  alreadyInstalled: boolean;
}

/** Marker embedded in converted files so re-exports can safely overwrite (= sync) */
export const LATTICE_SOURCE_RE = /lattice:source=/;

export function withSourceMarker(content: string, sourcePath: string): string {
  return `${content.trimEnd()}\n\n<!-- lattice:source=${sourcePath} -->\n`;
}

/** Strip a leading YAML frontmatter block, returning the body */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? content.slice(match[0].length).replace(/^\n+/, '') : content;
}

/** First H1 heading, or first non-empty body line */
export function extractTitle(content: string): string {
  const body = stripFrontmatter(content);
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return body.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? '';
}

function convertToCursorRule(content: string, _name: string, sourcePath: string): string {
  const body = stripFrontmatter(content);
  const frontmatter = `---\ndescription: ${extractTitle(content)}\nglobs:\nalwaysApply: false\n---\n\n`;
  return withSourceMarker(frontmatter + body, sourcePath);
}

function convertToCopilotInstructions(content: string, _name: string, sourcePath: string): string {
  const body = stripFrontmatter(content);
  return withSourceMarker(`---\napplyTo: "**"\n---\n\n${body}`, sourcePath);
}

function convertToGeminiCommand(content: string, _name: string, sourcePath: string): string {
  const body = stripFrontmatter(content)
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"""');
  const description = extractTitle(content).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `# lattice:source=${sourcePath}\ndescription = "${description}"\nprompt = """\n${body.trimEnd()}\n"""\n`;
}

/** Combos that need a rename or format conversion beyond the registry defaults */
const EXPORT_OVERRIDES: Record<string, ExportRule> = {
  'cursor:rule':     { method: 'convert', targetSubdir: 'rules',        targetName: n => `${n}.mdc`,             convert: convertToCursorRule },
  'copilot:rule':    { method: 'convert', targetSubdir: 'instructions', targetName: n => `${n}.instructions.md`, convert: convertToCopilotInstructions },
  'copilot:command': { method: 'symlink', targetSubdir: 'prompts',      targetName: n => `${n}.prompt.md` },
  'copilot:agent':   { method: 'symlink', targetSubdir: 'agents',       targetName: n => `${n}.agent.md` },
  'gemini:command':  { method: 'convert', targetSubdir: 'commands',     targetName: n => `${n}.toml`,            convert: convertToGeminiCommand },
};

/** Symlink into the registry-declared dir, keeping the source name when its extension fits */
function defaultRule(mapping: AssetDirMapping): ExportRule {
  const exts = mapping.extensions ?? ['.md'];
  return {
    method: 'symlink',
    targetSubdir: mapping.subdir,
    targetName: (name, basename) => exts.some(e => basename.endsWith(e)) ? basename : `${name}${exts[0]}`,
  };
}

export function getExportRule(agent: AgentDef, type: AssetType): ExportRule | undefined {
  const override = EXPORT_OVERRIDES[`${agent.id}:${type}`];
  if (override) return override;

  if (type === 'skill') {
    const hasSkills = agent.assetDirs.some(d => d.type === 'skill');
    return hasSkills
      ? { method: 'symlink', targetSubdir: agent.skillsSubdir, targetName: n => n }
      : undefined;
  }
  const mapping = agent.assetDirs.find(d => d.type === type && (d.extensions ?? []).includes('.md'));
  if (mapping) return defaultRule(mapping);

  return undefined;
}

/** Types that never export — they are per-repo context files or claude-internal */
const NON_EXPORTABLE: Set<AssetType> = new Set(['settings', 'claude-md', 'mcp-config', 'instructions']);

/** True for per-repo context files that always use the .claude/ layout, never an agent's config dir */
export const isNonExportableType = (type: AssetType): boolean => NON_EXPORTABLE.has(type);

function isInstalledForAgent(asset: Pick<SerializedAsset, 'name' | 'type'>, agentId: string, repos: SerializedRepo[]): boolean {
  return repos.some(r => r.assets.some(a =>
    a.name === asset.name && a.type === asset.type && (a.tool ?? DEFAULT_TOOL) === agentId,
  ));
}

/**
 * Build the export modal's target list. Scope is global when the asset lives in
 * a global/canonical repo (targets other tools' global dirs), otherwise project
 * (targets other tools' config dirs within the same repo).
 */
export function computeExportTargets(
  asset: Pick<SerializedAsset, 'name' | 'type' | 'path' | 'repoName' | 'tool'>,
  repos: SerializedRepo[],
): { scope: 'global' | 'project'; targets: ExportTarget[] } {
  const owningRepo = repos.find(r => r.name === asset.repoName);
  const scope = owningRepo?.isGlobal || owningRepo?.isCanonical ? 'global' : 'project';
  const searchRepos = scope === 'global'
    ? repos.filter(r => r.isGlobal)
    : repos.filter(r => r.name === asset.repoName);

  const targets = AGENT_REGISTRY.map((agent): ExportTarget => {
    if (isNonExportableType(asset.type)) {
      return { agentId: agent.id, displayName: agent.displayName, compatible: false, reason: `${asset.type} files are per-repo and cannot be exported`, alreadyInstalled: false };
    }
    const rule = getExportRule(agent, asset.type);
    const ownAgent = (asset.tool ?? DEFAULT_TOOL) === agent.id;
    const alreadyInstalled = ownAgent || isInstalledForAgent(asset, agent.id, searchRepos);
    if (!rule) {
      return { agentId: agent.id, displayName: agent.displayName, compatible: false, reason: `${agent.displayName} has no ${asset.type} support`, alreadyInstalled };
    }
    return { agentId: agent.id, displayName: agent.displayName, compatible: true, method: rule.method, alreadyInstalled };
  });

  return { scope, targets };
}
