import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ContextStore } from '../src/services/context-store';
import type { Asset, Repo } from '../src/types';

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return { name: 'repo-a', path: '/workspace/repo-a', claudePath: '/workspace/repo-a/.claude', assets: [], ...overrides };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return { name: 'test', type: 'command', path: '/workspace/repo-a/.claude/commands/test.md', isDirectory: false, hash: 'aaa111', repoName: 'repo-a', ...overrides };
}

describe('ContextStore', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-ctx-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates empty context on first load', async () => {
    const store = new ContextStore(tmpDir);
    const ctx = await store.load();
    assert.equal(ctx.version, 1);
    assert.equal(ctx.assets.length, 0);
  });

  it('tracks and retrieves an asset', async () => {
    const store = new ContextStore(tmpDir);
    await store.load();
    store.trackAsset({
      name: 'audit', type: 'skill', canonicalHash: 'abc',
      modifiedAt: '2026-01-01T00:00:00Z', installations: [],
    });
    assert.equal(store.data.assets.length, 1);
    assert.equal(store.data.assets[0].name, 'audit');
  });

  it('upserts existing asset by name+type', async () => {
    const store = new ContextStore(tmpDir);
    await store.load();
    store.trackAsset({ name: 'x', type: 'command', canonicalHash: 'v1', modifiedAt: '', installations: [] });
    store.trackAsset({ name: 'x', type: 'command', canonicalHash: 'v2', modifiedAt: '', installations: [] });
    assert.equal(store.data.assets.filter(a => a.name === 'x').length, 1);
    assert.equal(store.data.assets.find(a => a.name === 'x')!.canonicalHash, 'v2');
  });

  it('untracks an asset', async () => {
    const store = new ContextStore(tmpDir);
    await store.load();
    store.trackAsset({ name: 'gone', type: 'rule', canonicalHash: 'x', modifiedAt: '', installations: [] });
    assert.equal(store.data.assets.some(a => a.name === 'gone'), true);
    store.untrackAsset('gone', 'rule');
    assert.equal(store.data.assets.some(a => a.name === 'gone'), false);
  });

  it('updates and removes installations', async () => {
    const store = new ContextStore(tmpDir);
    await store.load();
    store.trackAsset({ name: 'shared', type: 'skill', canonicalHash: 'h1', modifiedAt: '', installations: [] });

    store.updateInstallation('shared', 'skill', {
      repoPath: '/repo-a', repoName: 'a', mode: 'symlink', hash: 'h1', synced: true,
    });
    assert.equal(store.data.assets.find(a => a.name === 'shared')!.installations.length, 1);

    store.updateInstallation('shared', 'skill', {
      repoPath: '/repo-b', repoName: 'b', mode: 'copy', hash: 'h2', synced: false,
    });
    assert.equal(store.data.assets.find(a => a.name === 'shared')!.installations.length, 2);

    // Update existing installation
    store.updateInstallation('shared', 'skill', {
      repoPath: '/repo-a', repoName: 'a', mode: 'symlink', hash: 'h1-updated', synced: true,
    });
    const inst = store.data.assets.find(a => a.name === 'shared')!.installations;
    assert.equal(inst.length, 2);
    assert.equal(inst.find(i => i.repoPath === '/repo-a')!.hash, 'h1-updated');

    store.removeInstallation('shared', 'skill', '/repo-a');
    assert.equal(store.data.assets.find(a => a.name === 'shared')!.installations.length, 1);
  });

  it('save returns false when nothing changed', async () => {
    const dir = path.join(tmpDir, 'noop');
    const store = new ContextStore(dir);
    await store.load();
    store.trackAsset({ name: 'a', type: 'command', canonicalHash: 'h', modifiedAt: '', installations: [] });
    await store.save(); // first save — writes

    const store2 = new ContextStore(dir);
    await store2.load();
    const changed = await store2.save();
    assert.equal(changed, false);
  });

  it('save returns true when asset added', async () => {
    const dir = path.join(tmpDir, 'changed');
    const store = new ContextStore(dir);
    await store.load();
    store.trackAsset({ name: 'new', type: 'skill', canonicalHash: 'h', modifiedAt: '', installations: [] });
    const changed = await store.save();
    assert.equal(changed, true);
  });

  it('persists to disk and reloads', async () => {
    const dir = path.join(tmpDir, 'persist');
    const store1 = new ContextStore(dir);
    await store1.load();
    store1.trackAsset({ name: 'persisted', type: 'agent', canonicalHash: 'ppp', modifiedAt: '2026-01-01', installations: [] });
    await store1.save();

    const store2 = new ContextStore(dir);
    const ctx = await store2.load();
    assert.equal(ctx.assets.length, 1);
    assert.equal(ctx.assets[0].name, 'persisted');
    assert.equal(ctx.assets[0].canonicalHash, 'ppp');
  });

  it('getGitHubAssets returns only sourced assets', async () => {
    const store = new ContextStore(tmpDir);
    await store.load();
    store.trackAsset({ name: 'local', type: 'command', canonicalHash: 'l', modifiedAt: '', installations: [] });
    store.trackAsset({
      name: 'remote', type: 'skill', canonicalHash: 'r', modifiedAt: '', installations: [],
      source: { url: 'https://github.com/user/repo', commitHash: 'abc', ref: 'main', fetchedAt: '' },
    });
    const gh = store.getGitHubAssets();
    assert.equal(gh.length, 1);
    assert.equal(gh[0].name, 'remote');
  });
});

describe('buildFromScan', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-scan-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('tracks canonical assets with installations', async () => {
    const store = new ContextStore(tmpDir);
    await store.load();

    const canonical = makeRepo({ name: 'Canonical', isCanonical: true, assets: [
      makeAsset({ name: 'audit', type: 'skill', hash: 'can-hash', repoName: 'Canonical' }),
    ] });
    const repoA = makeRepo({ name: 'repo-a', path: '/ws/a', assets: [
      makeAsset({ name: 'audit', type: 'skill', hash: 'can-hash', repoName: 'repo-a', isSymlink: true }),
    ] });

    store.buildFromScan([canonical, repoA], '~/.assets');

    const asset = store.data.assets.find(a => a.name === 'audit');
    assert.ok(asset);
    assert.equal(asset.canonicalHash, 'can-hash');
    assert.equal(asset.installations.length, 1);
    assert.equal(asset.installations[0].repoName, 'repo-a');
    assert.equal(asset.installations[0].synced, true);
  });

  it('tracks non-canonical assets from repos', async () => {
    const dir = path.join(tmpDir, 'noncan');
    const store = new ContextStore(dir);
    await store.load();

    const repoA = makeRepo({ name: 'a', path: '/ws/a', assets: [
      makeAsset({ name: 'my-cmd', type: 'command', hash: 'h1', repoName: 'a' }),
    ] });
    const repoB = makeRepo({ name: 'b', path: '/ws/b', assets: [
      makeAsset({ name: 'my-cmd', type: 'command', hash: 'h1', repoName: 'b' }),
    ] });

    store.buildFromScan([repoA, repoB], '~/.assets');

    const asset = store.data.assets.find(a => a.name === 'my-cmd');
    assert.ok(asset);
    assert.equal(asset.installations.length, 2);
  });

  it('preserves installations from unscanned repos (merge)', async () => {
    const dir = path.join(tmpDir, 'merge');
    const store = new ContextStore(dir);
    await store.load();

    // First scan with repo-a and repo-b
    const repoA = makeRepo({ name: 'a', path: '/ws/a', assets: [
      makeAsset({ name: 'shared', type: 'command', hash: 'h1', repoName: 'a' }),
    ] });
    const repoB = makeRepo({ name: 'b', path: '/ws/b', assets: [
      makeAsset({ name: 'shared', type: 'command', hash: 'h1', repoName: 'b' }),
    ] });
    store.buildFromScan([repoA, repoB], '~/.assets');
    assert.equal(store.data.assets.find(a => a.name === 'shared')!.installations.length, 2);

    // Second scan with only repo-a (repo-b not in scan)
    store.buildFromScan([repoA], '~/.assets');
    const installs = store.data.assets.find(a => a.name === 'shared')!.installations;
    assert.equal(installs.length, 2, 'should preserve repo-b installation');
    assert.ok(installs.some(i => i.repoName === 'b'), 'repo-b should still be present');
  });

  it('does not update modifiedAt when nothing changed', async () => {
    const dir = path.join(tmpDir, 'nomod');
    const store = new ContextStore(dir);
    await store.load();

    const repos = [makeRepo({ name: 'a', path: '/ws/a', assets: [
      makeAsset({ name: 'stable', type: 'rule', hash: 'h1', repoName: 'a' }),
    ] })];

    store.buildFromScan(repos, '~/.assets');
    const firstMod = store.data.assets.find(a => a.name === 'stable')!.modifiedAt;

    // Small delay to ensure different timestamp if it changes
    await new Promise(r => setTimeout(r, 10));

    store.buildFromScan(repos, '~/.assets');
    const secondMod = store.data.assets.find(a => a.name === 'stable')!.modifiedAt;

    assert.equal(firstMod, secondMod, 'modifiedAt should not change when data is identical');
  });

  it('updates modifiedAt when hash changes', async () => {
    const dir = path.join(tmpDir, 'hashmod');
    const store = new ContextStore(dir);
    await store.load();

    store.buildFromScan([makeRepo({ name: 'a', path: '/ws/a', assets: [
      makeAsset({ name: 'evolving', type: 'command', hash: 'v1', repoName: 'a' }),
    ] })], '~/.assets');
    const firstMod = store.data.assets.find(a => a.name === 'evolving')!.modifiedAt;

    await new Promise(r => setTimeout(r, 10));

    store.buildFromScan([makeRepo({ name: 'a', path: '/ws/a', assets: [
      makeAsset({ name: 'evolving', type: 'command', hash: 'v2', repoName: 'a' }),
    ] })], '~/.assets');
    const secondMod = store.data.assets.find(a => a.name === 'evolving')!.modifiedAt;

    assert.notEqual(firstMod, secondMod, 'modifiedAt should change when hash changes');
  });

  it('preserves source metadata across scans', async () => {
    const dir = path.join(tmpDir, 'source');
    const store = new ContextStore(dir);
    await store.load();

    store.trackAsset({
      name: 'gh-skill', type: 'skill', canonicalHash: 'h1', modifiedAt: '',
      installations: [], source: { url: 'https://github.com/user/repo', commitHash: 'abc', ref: 'main', fetchedAt: '' },
    });

    const canonical = makeRepo({ name: 'Canonical', isCanonical: true, assets: [
      makeAsset({ name: 'gh-skill', type: 'skill', hash: 'h1', repoName: 'Canonical' }),
    ] });
    store.buildFromScan([canonical], '~/.assets');

    const asset = store.data.assets.find(a => a.name === 'gh-skill');
    assert.ok(asset?.source, 'source metadata should be preserved');
    assert.equal(asset.source!.url, 'https://github.com/user/repo');
  });

  it('sorts installations by repoPath', async () => {
    const dir = path.join(tmpDir, 'sort');
    const store = new ContextStore(dir);
    await store.load();

    store.buildFromScan([
      makeRepo({ name: 'z-repo', path: '/ws/z', assets: [makeAsset({ name: 'x', hash: 'h', repoName: 'z-repo' })] }),
      makeRepo({ name: 'a-repo', path: '/ws/a', assets: [makeAsset({ name: 'x', hash: 'h', repoName: 'a-repo' })] }),
      makeRepo({ name: 'm-repo', path: '/ws/m', assets: [makeAsset({ name: 'x', hash: 'h', repoName: 'm-repo' })] }),
    ], '~/.assets');

    const installs = store.data.assets.find(a => a.name === 'x')!.installations;
    assert.equal(installs[0].repoPath, '/ws/a');
    assert.equal(installs[1].repoPath, '/ws/m');
    assert.equal(installs[2].repoPath, '/ws/z');
  });
});
