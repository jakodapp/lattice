import { AgentDef, DEFAULT_TOOL, SELECTABLE_AGENTS, getAgent } from './agent-defs';

/** Minimal persistence interface — satisfied by vscode.Memento, fakeable in tests */
export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export const SELECTED_AGENT_KEY = 'lattice.selectedAgent';

/**
 * The user's working agent. Falls back to the host-detected default until the
 * user makes an explicit choice; only explicit choices are persisted.
 */
export class AgentSelection {
  constructor(
    private readonly memento: MementoLike,
    private readonly hostDefaultId: string,
  ) {}

  get id(): string {
    const stored = this.memento.get<string>(SELECTED_AGENT_KEY);
    if (stored && SELECTABLE_AGENTS.some(a => a.id === stored)) return stored;
    return this.hostDefaultId;
  }

  get def(): AgentDef {
    return getAgent(this.id) ?? getAgent(DEFAULT_TOOL)!;
  }

  async set(id: string): Promise<void> {
    if (!SELECTABLE_AGENTS.some(a => a.id === id)) return;
    await this.memento.update(SELECTED_AGENT_KEY, id);
  }
}
