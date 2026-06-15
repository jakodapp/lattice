import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getWriteTarget } from '../src/services/path-resolver';
import { getAgent } from '../src/services/agent-defs';
import { CcmError } from '../src/errors';
import { Asset, Repo } from '../src/types';

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    name: 'test-repo',
    path: '/workspace/test-repo',
    claudePath: '/workspace/test-repo/.claude',
    assets: [],
    ...overrides,
  };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    name: 'test-asset',
    type: 'command',
    path: '/workspace/source/.claude/commands/test-asset.md',
    isDirectory: false,
    hash: 'abc',
    repoName: 'source',
    ...overrides,
  };
}

/** The resolved write path, dropping the rule wrapper — keeps the assertions terse */
const targetPath = (asset: Asset, repo: Repo, agent?: ReturnType<typeof getAgent>) =>
  getWriteTarget(asset, repo, agent).targetPath;

describe('getWriteTarget — default .claude/ layout', () => {
  const target = makeRepo();

  it('maps command to .claude/commands/', () => {
    const asset = makeAsset({ type: 'command', path: '/src/.claude/commands/my-cmd.md' });
    const result = targetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/commands/my-cmd.md');
  });

  it('maps skill directory to .claude/skills/', () => {
    const asset = makeAsset({
      type: 'skill',
      path: '/src/.claude/skills/audit',
      isDirectory: true,
    });
    const result = targetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/skills/audit');
  });

  it('maps agent to .claude/agents/', () => {
    const asset = makeAsset({ type: 'agent', path: '/src/.claude/agents/reviewer.md' });
    const result = targetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/agents/reviewer.md');
  });

  it('maps rule to .claude/rules/', () => {
    const asset = makeAsset({ type: 'rule', path: '/src/.claude/rules/testing.md' });
    const result = targetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/rules/testing.md');
  });

  it('maps settings to .claude/ root', () => {
    const asset = makeAsset({ type: 'settings', path: '/src/.claude/settings.local.json', name: 'settings.local.json' });
    const result = targetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/settings.local.json');
  });

  it('maps CLAUDE.md (root) to repo root', () => {
    const asset = makeAsset({ type: 'claude-md', name: 'CLAUDE.md (root)', path: '/src/CLAUDE.md' });
    const result = targetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/CLAUDE.md');
  });

  it('maps CLAUDE.md (.claude/) to .claude/', () => {
    const asset = makeAsset({ type: 'claude-md', name: 'CLAUDE.md (.claude/)', path: '/src/.claude/CLAUDE.md' });
    const result = targetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/CLAUDE.md');
  });

  it('maps output-style to .claude/output-styles/', () => {
    const asset = makeAsset({ type: 'output-style', path: '/src/.claude/output-styles/teaching.md' });
    const result = targetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/output-styles/teaching.md');
  });
});

describe('getWriteTarget with a selected agent', () => {
  const target = makeRepo();

  it('cursor skill goes to .cursor/skills/', () => {
    const asset = makeAsset({ type: 'skill', name: 'audit', path: '/src/.claude/skills/audit', isDirectory: true });
    const { targetPath, rule } = getWriteTarget(asset, target, getAgent('cursor'));
    assert.equal(targetPath, '/workspace/test-repo/.cursor/skills/audit');
    assert.equal(rule?.method, 'symlink');
  });

  it('cursor rule converts to .cursor/rules/*.mdc', () => {
    const asset = makeAsset({ type: 'rule', name: 'style', path: '/src/.claude/rules/style.md' });
    const { targetPath, rule } = getWriteTarget(asset, target, getAgent('cursor'));
    assert.equal(targetPath, '/workspace/test-repo/.cursor/rules/style.mdc');
    assert.equal(rule?.method, 'convert');
  });

  it('codex command goes to .codex/prompts/', () => {
    const asset = makeAsset({ type: 'command', name: 'deploy', path: '/src/.claude/commands/deploy.md' });
    const { targetPath } = getWriteTarget(asset, target, getAgent('codex'));
    assert.equal(targetPath, '/workspace/test-repo/.codex/prompts/deploy.md');
  });

  it('gemini command converts to .gemini/commands/*.toml', () => {
    const asset = makeAsset({ type: 'command', name: 'deploy', path: '/src/.claude/commands/deploy.md' });
    const { targetPath, rule } = getWriteTarget(asset, target, getAgent('gemini'));
    assert.equal(targetPath, '/workspace/test-repo/.gemini/commands/deploy.toml');
    assert.equal(rule?.method, 'convert');
  });

  it('throws AGENT_TYPE_UNSUPPORTED for unsupported combos', () => {
    const asset = makeAsset({ type: 'rule', name: 'style', path: '/src/.claude/rules/style.md' });
    assert.throws(
      () => getWriteTarget(asset, target, getAgent('codex')),
      (err: unknown) => err instanceof CcmError && err.code === 'AGENT_TYPE_UNSUPPORTED',
    );
  });

  it('explicit claude agent matches the default layout', () => {
    const asset = makeAsset({ type: 'command', path: '/src/.claude/commands/my-cmd.md' });
    assert.equal(targetPath(asset, target, getAgent('claude')), targetPath(asset, target));
  });

  it('global target repos keep their own layout, agent ignored', () => {
    const globalRepo = makeRepo({ name: '~/.cursor', path: '/home/u', claudePath: '/home/u/.cursor', isGlobal: true });
    const asset = makeAsset({ type: 'rule', name: 'style', path: '/src/.claude/rules/style.md' });
    const { targetPath, rule } = getWriteTarget(asset, globalRepo, getAgent('cursor'));
    assert.equal(targetPath, '/home/u/.cursor/rules/style.md');
    assert.equal(rule, undefined);
  });
});
