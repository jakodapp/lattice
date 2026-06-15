import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AgentSelection, MementoLike, SELECTED_AGENT_KEY } from '../src/services/agent-selection';

function fakeMemento(initial: Record<string, unknown> = {}): MementoLike & { store: Record<string, unknown> } {
  const store = { ...initial };
  return {
    store,
    get: <T>(key: string) => store[key] as T | undefined,
    update: async (key: string, value: unknown) => { store[key] = value; },
  };
}

describe('AgentSelection', () => {
  it('falls back to the host default when nothing is stored', () => {
    const selection = new AgentSelection(fakeMemento(), 'cursor');
    assert.equal(selection.id, 'cursor');
    assert.equal(selection.def.id, 'cursor');
  });

  it('returns the stored choice over the host default', () => {
    const selection = new AgentSelection(fakeMemento({ [SELECTED_AGENT_KEY]: 'gemini' }), 'claude');
    assert.equal(selection.id, 'gemini');
  });

  it('persists explicit choices', async () => {
    const memento = fakeMemento();
    const selection = new AgentSelection(memento, 'claude');
    await selection.set('copilot');
    assert.equal(memento.store[SELECTED_AGENT_KEY], 'copilot');
    assert.equal(selection.id, 'copilot');
  });

  it('rejects unknown agent ids', async () => {
    const memento = fakeMemento();
    const selection = new AgentSelection(memento, 'claude');
    await selection.set('nonexistent');
    assert.equal(memento.store[SELECTED_AGENT_KEY], undefined);
    assert.equal(selection.id, 'claude');
  });

  it('rejects the universal pseudo-agent', async () => {
    const memento = fakeMemento();
    const selection = new AgentSelection(memento, 'claude');
    await selection.set('agents');
    assert.equal(memento.store[SELECTED_AGENT_KEY], undefined);
  });

  it('ignores a stale stored id that is no longer selectable', () => {
    const selection = new AgentSelection(fakeMemento({ [SELECTED_AGENT_KEY]: 'windsurf' }), 'claude');
    assert.equal(selection.id, 'claude');
  });
});
