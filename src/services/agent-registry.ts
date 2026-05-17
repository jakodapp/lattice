import * as fs from 'fs/promises';
import * as path from 'path';

export interface AgentDef {
  id: string;
  displayName: string;
  /** Directory name relative to repo root, e.g. '.claude' */
  configDir: string;
  /** Subdirectory for skills within the config dir */
  skillsSubdir: string;
  /** Global config path (unexpanded, with ~) */
  globalDir: string;
}

export const AGENT_REGISTRY: AgentDef[] = [
  { id: 'claude', displayName: 'Claude', configDir: '.claude', skillsSubdir: 'skills', globalDir: '~/.claude' },
  { id: 'cursor', displayName: 'Cursor', configDir: '.cursor', skillsSubdir: 'skills', globalDir: '~/.cursor' },
  { id: 'cline', displayName: 'Cline', configDir: '.cline', skillsSubdir: 'skills', globalDir: '~/.cline' },
  { id: 'windsurf', displayName: 'Windsurf', configDir: '.windsurf', skillsSubdir: 'skills', globalDir: '~/.codeium/windsurf' },
  { id: 'codex', displayName: 'Codex', configDir: '.codex', skillsSubdir: 'skills', globalDir: '~/.codex' },
  { id: 'continue', displayName: 'Continue', configDir: '.continue', skillsSubdir: 'skills', globalDir: '~/.continue' },
  { id: 'roo', displayName: 'Roo Code', configDir: '.roo', skillsSubdir: 'skills', globalDir: '~/.roo' },
  { id: 'copilot', displayName: 'Copilot', configDir: '.github', skillsSubdir: 'skills', globalDir: '~/.github' },
];

export type AgentId = string;

/** Detect which agent config directories exist in a repo */
export async function detectAgentsInRepo(repoPath: string): Promise<string[]> {
  const detected: string[] = [];
  for (const agent of AGENT_REGISTRY) {
    const agentDir = path.join(repoPath, agent.configDir);
    try {
      await fs.access(agentDir);
      detected.push(agent.id);
    } catch {
      // Not present
    }
  }
  return detected;
}

/** Get agent definition by ID */
export function getAgent(id: string): AgentDef | undefined {
  return AGENT_REGISTRY.find(a => a.id === id);
}
