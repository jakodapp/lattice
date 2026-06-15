import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { mergeGlobalAssets, computeDivergedPaths, isAssetActiveForAgent, UNREADABLE_HASH } from '../src/webview/types';
import type { SerializedAsset, SerializedRepo } from '../src/webview/types';

function asset(overrides: Partial<SerializedAsset> & { name: string; repoName: string }): SerializedAsset {
  return {
    type: 'rule',
    path: `/${overrides.repoName}/${overrides.name}.md`,
    isDirectory: false,
    hash: 'abc123',
    ...overrides,
  };
}

function globalRepo(name: string, assets: SerializedAsset[]): SerializedRepo {
  return { name, path: `~/${name}`, claudePath: `~/${name}`, assets, isGlobal: true };
}

function projectRepo(name: string, assets: SerializedAsset[]): SerializedRepo {
  return { name, path: `/projects/${name}`, claudePath: `/projects/${name}/.claude`, assets };
}

// ── mergeGlobalAssets ─────────────────────────────────────────────────────────

describe('mergeGlobalAssets', () => {
  it('returns empty for no global repos', () => {
    assert.deepEqual(mergeGlobalAssets([]), []);
  });

  it('returns empty when repos have no global flag', () => {
    const repos = [projectRepo('my-proj', [asset({ name: 'foo', repoName: 'my-proj' })])];
    assert.deepEqual(mergeGlobalAssets(repos), []);
  });

  it('identical-hash copies collapse into one chip with mergedCount and mergedTools', () => {
    const hash = 'same-hash';
    const repos = [
      globalRepo('~/.claude', [asset({ name: 'style', repoName: '~/.claude', hash, tool: undefined })]),
      globalRepo('~/.cursor', [asset({ name: 'style', repoName: '~/.cursor', hash, tool: 'cursor' })]),
    ];
    const result = mergeGlobalAssets(repos);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'style');
    assert.equal(result[0].mergedCount, 2);
    assert.deepEqual(result[0].mergedTools, ['claude', 'cursor']);
  });

  it('diverged copies (different hashes, same name+type) stay as separate chips', () => {
    const repos = [
      globalRepo('~/.claude', [asset({ name: 'style', repoName: '~/.claude', hash: 'hash-a' })]),
      globalRepo('~/.cursor', [asset({ name: 'style', repoName: '~/.cursor', hash: 'hash-b', tool: 'cursor' })]),
    ];
    const result = mergeGlobalAssets(repos);
    assert.equal(result.length, 2);
  });

  it('symlinks collapse into their non-symlink original as representative', () => {
    const hash = 'shared';
    const original = asset({ name: 'guide', repoName: '~/.claude', hash, isSymlink: false });
    const linked = asset({ name: 'guide', repoName: '~/.cursor', hash, isSymlink: true, tool: 'cursor', canonicalPath: original.path });
    const repos = [
      globalRepo('~/.claude', [original]),
      globalRepo('~/.cursor', [linked]),
    ];
    const result = mergeGlobalAssets(repos);
    assert.equal(result.length, 1);
    assert.equal(result[0].isSymlink, false);
    assert.equal(result[0].mergedCount, 2);
  });

  it('UNREADABLE_HASH assets never dedupe across repos', () => {
    const repos = [
      globalRepo('~/.claude', [asset({ name: 'broken', repoName: '~/.claude', hash: UNREADABLE_HASH })]),
      globalRepo('~/.cursor', [asset({ name: 'broken', repoName: '~/.cursor', hash: UNREADABLE_HASH, tool: 'cursor' })]),
    ];
    const result = mergeGlobalAssets(repos);
    assert.equal(result.length, 2);
  });

  it('assets with different types do not merge even if same name', () => {
    const hash = 'h';
    const repos = [
      globalRepo('~/.claude', [asset({ name: 'foo', repoName: '~/.claude', type: 'rule', hash })]),
      globalRepo('~/.cursor', [asset({ name: 'foo', repoName: '~/.cursor', type: 'command', hash, tool: 'cursor' })]),
    ];
    const result = mergeGlobalAssets(repos);
    assert.equal(result.length, 2);
  });
});

// ── computeDivergedPaths ──────────────────────────────────────────────────────

describe('computeDivergedPaths', () => {
  it('returns empty set when all assets are unique', () => {
    const repos = [
      projectRepo('a', [asset({ name: 'alpha', repoName: 'a', hash: 'h1' })]),
      projectRepo('b', [asset({ name: 'beta', repoName: 'b', hash: 'h2' })]),
    ];
    assert.equal(computeDivergedPaths(repos).size, 0);
  });

  it('flags minority hashes when same name+type appears in multiple repos', () => {
    const majority = 'h1';
    const minority = 'h2';
    const a1 = asset({ name: 'style', repoName: 'a', hash: majority });
    const b1 = asset({ name: 'style', repoName: 'b', hash: majority });
    const c1 = asset({ name: 'style', repoName: 'c', hash: minority });
    const repos = [
      projectRepo('a', [a1]),
      projectRepo('b', [b1]),
      projectRepo('c', [c1]),
    ];
    const result = computeDivergedPaths(repos);
    assert.ok(!result.has(a1.path), 'majority should not be flagged');
    assert.ok(!result.has(b1.path), 'majority should not be flagged');
    assert.ok(result.has(c1.path), 'minority should be flagged');
  });

  it('identical global copies count as one vote (not inflating majority)', () => {
    const sharedHash = 'global-hash';
    const differentHash = 'local-hash';
    const g1 = asset({ name: 'rules', repoName: '~/.claude', hash: sharedHash });
    const g2 = asset({ name: 'rules', repoName: '~/.cursor', hash: sharedHash, tool: 'cursor' });
    const p1 = asset({ name: 'rules', repoName: 'proj', hash: differentHash });
    const repos = [
      globalRepo('~/.claude', [g1]),
      globalRepo('~/.cursor', [g2]),
      projectRepo('proj', [p1]),
    ];
    // Global copies with same hash count once: 1 global vote vs 1 project vote → tie, both flagged
    const result = computeDivergedPaths(repos);
    assert.ok(result.has(g1.path) || result.has(p1.path), 'at least one diverged path flagged');
  });

  it('UNREADABLE_HASH assets are always flagged', () => {
    const good = asset({ name: 'guide', repoName: 'a', hash: 'ok' });
    const bad = asset({ name: 'guide', repoName: 'b', hash: UNREADABLE_HASH });
    const repos = [projectRepo('a', [good]), projectRepo('b', [bad])];
    const result = computeDivergedPaths(repos);
    assert.ok(result.has(bad.path), 'unreadable asset should be flagged');
  });

  it('single-instance assets are never flagged', () => {
    const a1 = asset({ name: 'solo', repoName: 'a', hash: 'unique' });
    const repos = [projectRepo('a', [a1])];
    assert.equal(computeDivergedPaths(repos).size, 0);
  });
});

// ── isAssetActiveForAgent ─────────────────────────────────────────────────────

describe('isAssetActiveForAgent', () => {
  it('tool undefined means claude', () => {
    const a = asset({ name: 'x', repoName: 'r', tool: undefined });
    assert.equal(isAssetActiveForAgent(a, 'claude'), true);
    assert.equal(isAssetActiveForAgent(a, 'cursor'), false);
  });

  it('tool matches its own agent only', () => {
    const a = asset({ name: 'x', repoName: 'r', tool: 'cursor' });
    assert.equal(isAssetActiveForAgent(a, 'cursor'), true);
    assert.equal(isAssetActiveForAgent(a, 'claude'), false);
  });

  it('universal .agents assets are inactive under every selectable agent', () => {
    const a = asset({ name: 'x', repoName: 'r', tool: 'agents' });
    for (const id of ['claude', 'cursor', 'codex', 'copilot', 'gemini']) {
      assert.equal(isAssetActiveForAgent(a, id), false);
    }
  });

  it('GLOBAL merged chips use mergedTools', () => {
    const a = asset({ name: 'x', repoName: 'r', tool: 'cursor', mergedTools: ['claude', 'cursor'] });
    assert.equal(isAssetActiveForAgent(a, 'claude'), true);
    assert.equal(isAssetActiveForAgent(a, 'cursor'), true);
    assert.equal(isAssetActiveForAgent(a, 'gemini'), false);
  });
});
