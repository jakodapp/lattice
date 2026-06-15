import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { detectAgentsInRepo, getAgent, AGENT_REGISTRY } from '../src/services/agent-registry';
import { SELECTABLE_AGENTS, detectHostAgentId } from '../src/services/agent-defs';

describe('AGENT_REGISTRY', () => {
  it('includes claude as the first agent', () => {
    assert.equal(AGENT_REGISTRY[0].id, 'claude');
    assert.equal(AGENT_REGISTRY[0].configDir, '.claude');
  });

  it('has unique IDs', () => {
    const ids = AGENT_REGISTRY.map(a => a.id);
    assert.equal(ids.length, new Set(ids).size);
  });

  it('contains exactly the six supported agents', () => {
    assert.deepEqual(
      AGENT_REGISTRY.map(a => a.id).sort(),
      ['agents', 'claude', 'codex', 'copilot', 'cursor', 'gemini'],
    );
  });
});

describe('SELECTABLE_AGENTS', () => {
  it('excludes the universal pseudo-agent', () => {
    assert.ok(!SELECTABLE_AGENTS.some(a => a.id === 'agents'));
    assert.equal(SELECTABLE_AGENTS.length, AGENT_REGISTRY.length - 1);
  });
});

describe('detectHostAgentId', () => {
  it('detects Cursor from appName', () => {
    assert.equal(detectHostAgentId('Cursor'), 'cursor');
    assert.equal(detectHostAgentId('Cursor Nightly'), 'cursor');
  });

  it('detects Antigravity as gemini', () => {
    assert.equal(detectHostAgentId('Antigravity'), 'gemini');
  });

  it('falls back to uriScheme matching', () => {
    assert.equal(detectHostAgentId('Some Editor', 'cursor'), 'cursor');
    assert.equal(detectHostAgentId('Some Editor', 'antigravity'), 'gemini');
  });

  it('defaults to claude for VSCode and unknown hosts', () => {
    assert.equal(detectHostAgentId('Visual Studio Code', 'vscode'), 'claude');
    assert.equal(detectHostAgentId('Unknown IDE'), 'claude');
  });
});

describe('getAgent', () => {
  it('returns agent by id', () => {
    const agent = getAgent('cursor');
    assert.ok(agent);
    assert.equal(agent.displayName, 'Cursor');
    assert.equal(agent.configDir, '.cursor');
  });

  it('returns undefined for unknown id', () => {
    assert.equal(getAgent('nonexistent'), undefined);
  });
});

describe('detectAgentsInRepo', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-agents-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects claude when .claude/ exists', async () => {
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
    const agents = await detectAgentsInRepo(tmpDir);
    assert.ok(agents.includes('claude'));
  });

  it('detects multiple agents', async () => {
    await fs.mkdir(path.join(tmpDir, '.cursor'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.gemini'), { recursive: true });
    const agents = await detectAgentsInRepo(tmpDir);
    assert.ok(agents.includes('claude'));
    assert.ok(agents.includes('cursor'));
    assert.ok(agents.includes('gemini'));
  });

  it('returns empty for repo with no agent dirs', async () => {
    const emptyDir = path.join(tmpDir, 'empty-repo');
    await fs.mkdir(emptyDir, { recursive: true });
    const agents = await detectAgentsInRepo(emptyDir);
    assert.equal(agents.length, 0);
  });
});
