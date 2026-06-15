import * as fs from 'fs/promises';
import * as path from 'path';
import { AGENT_REGISTRY } from './agent-defs';

export type { AssetDirMapping, AgentDef, AgentId } from './agent-defs';
export { AGENT_REGISTRY, getAgent, getAgentByGlobalDir } from './agent-defs';

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
