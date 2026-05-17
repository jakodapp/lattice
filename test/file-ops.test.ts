import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getTargetPath } from '../src/services/path-resolver';
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

describe('getTargetPath', () => {
  const target = makeRepo();

  it('maps command to .claude/commands/', () => {
    const asset = makeAsset({ type: 'command', path: '/src/.claude/commands/my-cmd.md' });
    const result = getTargetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/commands/my-cmd.md');
  });

  it('maps skill directory to .claude/skills/', () => {
    const asset = makeAsset({
      type: 'skill',
      path: '/src/.claude/skills/audit',
      isDirectory: true,
    });
    const result = getTargetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/skills/audit');
  });

  it('maps agent to .claude/agents/', () => {
    const asset = makeAsset({ type: 'agent', path: '/src/.claude/agents/reviewer.md' });
    const result = getTargetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/agents/reviewer.md');
  });

  it('maps rule to .claude/rules/', () => {
    const asset = makeAsset({ type: 'rule', path: '/src/.claude/rules/testing.md' });
    const result = getTargetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/rules/testing.md');
  });

  it('maps settings to .claude/ root', () => {
    const asset = makeAsset({ type: 'settings', path: '/src/.claude/settings.local.json', name: 'settings.local.json' });
    const result = getTargetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/settings.local.json');
  });

  it('maps CLAUDE.md (root) to repo root', () => {
    const asset = makeAsset({ type: 'claude-md', name: 'CLAUDE.md (root)', path: '/src/CLAUDE.md' });
    const result = getTargetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/CLAUDE.md');
  });

  it('maps CLAUDE.md (.claude/) to .claude/', () => {
    const asset = makeAsset({ type: 'claude-md', name: 'CLAUDE.md (.claude/)', path: '/src/.claude/CLAUDE.md' });
    const result = getTargetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/CLAUDE.md');
  });

  it('maps output-style to .claude/output-styles/', () => {
    const asset = makeAsset({ type: 'output-style', path: '/src/.claude/output-styles/teaching.md' });
    const result = getTargetPath(asset, target);
    assert.equal(result, '/workspace/test-repo/.claude/output-styles/teaching.md');
  });
});
