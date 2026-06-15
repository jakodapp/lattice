import type { AssetType } from '../types';

/** Mapping from a subdirectory of an agent's config dir to the asset type it holds */
export interface AssetDirMapping {
  /** Subdirectory relative to the config dir, e.g. 'rules' */
  subdir: string;
  type: AssetType;
  /** File suffixes accepted (longest matched first); ignored for skill dirs */
  extensions?: string[];
}

export interface AgentDef {
  id: string;
  displayName: string;
  /** Directory name relative to repo root, e.g. '.claude' */
  configDir: string;
  /** Subdirectory for skills within the config dir */
  skillsSubdir: string;
  /** Global config path (unexpanded, with ~) */
  globalDir: string;
  /** Asset-holding subdirectories inside the config dir */
  assetDirs: AssetDirMapping[];
}

const MD = ['.md'];

/**
 * Known agent config conventions (mid-2026).
 * `.agents/` is the emerging universal directory (Antigravity default, read by
 * Codex, Cursor, and Copilot). Antigravity shares Gemini's config (`.gemini`,
 * `~/.gemini`) — they are one entry here.
 */
export const AGENT_REGISTRY: AgentDef[] = [
  {
    id: 'claude', displayName: 'Claude', configDir: '.claude', skillsSubdir: 'skills', globalDir: '~/.claude',
    assetDirs: [
      { subdir: 'skills', type: 'skill' },
      { subdir: 'commands', type: 'command', extensions: MD },
      { subdir: 'agents', type: 'agent', extensions: MD },
      { subdir: 'rules', type: 'rule', extensions: MD },
      { subdir: 'scripts', type: 'script', extensions: ['.md', '.js'] },
      { subdir: 'hooks', type: 'hook', extensions: ['.md', '.js'] },
      { subdir: 'output-styles', type: 'output-style', extensions: MD },
    ],
  },
  {
    id: 'agents', displayName: 'Universal', configDir: '.agents', skillsSubdir: 'skills', globalDir: '~/.agents',
    assetDirs: [
      { subdir: 'skills', type: 'skill' },
      { subdir: 'rules', type: 'rule', extensions: MD },
      { subdir: 'workflows', type: 'workflow', extensions: MD },
      { subdir: 'commands', type: 'command', extensions: MD },
      { subdir: 'agents', type: 'agent', extensions: MD },
    ],
  },
  {
    id: 'cursor', displayName: 'Cursor', configDir: '.cursor', skillsSubdir: 'skills', globalDir: '~/.cursor',
    assetDirs: [
      { subdir: 'skills', type: 'skill' },
      { subdir: 'rules', type: 'rule', extensions: ['.mdc', '.md'] },
      { subdir: 'commands', type: 'command', extensions: MD },
      { subdir: 'agents', type: 'agent', extensions: MD },
    ],
  },
  {
    id: 'codex', displayName: 'Codex', configDir: '.codex', skillsSubdir: 'skills', globalDir: '~/.codex',
    assetDirs: [
      { subdir: 'skills', type: 'skill' },
      { subdir: 'prompts', type: 'command', extensions: MD },
    ],
  },
  {
    id: 'copilot', displayName: 'Copilot', configDir: '.github', skillsSubdir: 'skills', globalDir: '~/.github',
    assetDirs: [
      { subdir: 'skills', type: 'skill' },
      { subdir: 'instructions', type: 'rule', extensions: ['.instructions.md'] },
      { subdir: 'prompts', type: 'command', extensions: ['.prompt.md'] },
      { subdir: 'agents', type: 'agent', extensions: ['.agent.md'] },
      { subdir: 'chatmodes', type: 'agent', extensions: ['.chatmode.md'] },
    ],
  },
  {
    // Shared by Gemini CLI and Antigravity (Google's IDE running Gemini)
    id: 'gemini', displayName: 'Gemini', configDir: '.gemini', skillsSubdir: 'skills', globalDir: '~/.gemini',
    assetDirs: [
      { subdir: 'skills', type: 'skill' },
      { subdir: 'commands', type: 'command', extensions: ['.toml'] },
      { subdir: 'rules', type: 'rule', extensions: MD },
      { subdir: 'workflows', type: 'workflow', extensions: MD },
    ],
  },
];

export type AgentId = string;

/** Default agent ID when the `tool` field is absent */
export const DEFAULT_TOOL = 'claude';

/** Agents offered in the header selector — excludes the universal '.agents' pseudo-agent */
export const SELECTABLE_AGENTS: AgentDef[] = AGENT_REGISTRY.filter(a => a.id !== 'agents');

/** Map the host IDE identity to a default working agent */
export function detectHostAgentId(appName: string, uriScheme?: string): string {
  const hay = `${appName} ${uriScheme ?? ''}`.toLowerCase();
  if (hay.includes('cursor')) return 'cursor';
  if (hay.includes('antigravity')) return 'gemini';
  return DEFAULT_TOOL;
}

/** Get agent definition by ID */
export function getAgent(id: string): AgentDef | undefined {
  return AGENT_REGISTRY.find(a => a.id === id);
}

/** Find the agent whose global dir matches the given (unexpanded) path */
export function getAgentByGlobalDir(globalPath: string): AgentDef | undefined {
  return AGENT_REGISTRY.find(a => a.globalDir === globalPath);
}
