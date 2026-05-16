import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { detectAgentsInRepo, getAgent, AGENT_REGISTRY } from '../src/services/agent-registry';

describe('AGENT_REGISTRY', () => {
  it('includes claude as the first agent', () => {
    assert.equal(AGENT_REGISTRY[0].id, 'claude');
    assert.equal(AGENT_REGISTRY[0].configDir, '.claude');
  });

  it('has unique IDs', () => {
    const ids = AGENT_REGISTRY.map(a => a.id);
    assert.equal(ids.length, new Set(ids).size);
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
    await fs.mkdir(path.join(tmpDir, '.cline'), { recursive: true });
    const agents = await detectAgentsInRepo(tmpDir);
    assert.ok(agents.includes('claude'));
    assert.ok(agents.includes('cursor'));
    assert.ok(agents.includes('cline'));
  });

  it('returns empty for repo with no agent dirs', async () => {
    const emptyDir = path.join(tmpDir, 'empty-repo');
    await fs.mkdir(emptyDir, { recursive: true });
    const agents = await detectAgentsInRepo(emptyDir);
    assert.equal(agents.length, 0);
  });
});
