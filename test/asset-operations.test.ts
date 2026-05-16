import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { copyAssetToRepos, moveAssetToRepo, installCanonicalToRepos, findAffectedSymlinks, deleteCanonicalAsset, getDeleteWarning } from '../src/services/asset-operations';
import type { Asset, Repo } from '../src/types';

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return { name: 'repo', path: '/ws/repo', claudePath: '/ws/repo/.claude', assets: [], ...overrides };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return { name: 'test', type: 'command', path: '/ws/src/.claude/commands/test.md', isDirectory: false, hash: 'aaa', repoName: 'src', ...overrides };
}

describe('getDeleteWarning', () => {
  it('returns context file warning', () => {
    const w = getDeleteWarning({ assetName: 'x', repoName: 'r', isContextFile: true, isAssetsView: false, instanceCount: 1 });
    assert.equal(w.action, 'Delete permanently');
    assert.ok(w.label.includes('unique context file'));
  });

  it('returns assets view warning with count', () => {
    const w = getDeleteWarning({ assetName: 'x', repoName: 'r', isContextFile: false, isAssetsView: true, instanceCount: 3 });
    assert.equal(w.action, 'Delete permanently');
    assert.ok(w.label.includes('3 repo(s)'));
  });

  it('returns symlink remove warning', () => {
    const w = getDeleteWarning({ assetName: 'x', repoName: 'r', isSymlink: true, isContextFile: false, isAssetsView: false, instanceCount: 2 });
    assert.equal(w.action, 'Remove');
    assert.ok(w.label.includes('original file will not be affected'));
  });

  it('returns last copy warning', () => {
    const w = getDeleteWarning({ assetName: 'x', repoName: 'r', isContextFile: false, isAssetsView: false, instanceCount: 1 });
    assert.equal(w.action, 'Delete permanently');
    assert.ok(w.label.includes('ONLY copy'));
  });

  it('returns multi-copy remove warning', () => {
    const w = getDeleteWarning({ assetName: 'x', repoName: 'r', isContextFile: false, isAssetsView: false, instanceCount: 3 });
    assert.equal(w.action, 'Remove');
    assert.ok(w.label.includes('2 other repo(s)'));
  });
});

describe('findAffectedSymlinks', () => {
  it('finds repos with symlinks pointing to the asset', () => {
    const canonical = makeAsset({ name: 'skill-a', path: '/canonical/skills/skill-a' });
    const repos: Repo[] = [
      makeRepo({ name: 'canonical', isCanonical: true, assets: [canonical] }),
      makeRepo({ name: 'repo-a', assets: [
        makeAsset({ name: 'skill-a', isSymlink: true, canonicalPath: '/canonical/skills/skill-a' }),
      ] }),
      makeRepo({ name: 'repo-b', assets: [
        makeAsset({ name: 'skill-a', isSymlink: false }),
      ] }),
      makeRepo({ name: 'repo-c', isGlobal: true, assets: [] }),
    ];

    const affected = findAffectedSymlinks(canonical, repos);
    assert.deepEqual(affected, ['repo-a']);
  });

  it('returns empty when no symlinks point to asset', () => {
    const canonical = makeAsset({ path: '/canonical/x' });
    const repos = [makeRepo({ assets: [makeAsset({ isSymlink: false })] })];
    assert.deepEqual(findAffectedSymlinks(canonical, repos), []);
  });
});

describe('copyAssetToRepos', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-ops-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns OperationResult with success count', async () => {
    // Create source file
    const srcDir = path.join(tmpDir, 'src', '.claude', 'commands');
    await fs.mkdir(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'my-cmd.md');
    await fs.writeFile(srcFile, '# My Command');

    // Create target repos
    const targetA = path.join(tmpDir, 'target-a');
    const targetB = path.join(tmpDir, 'target-b');
    await fs.mkdir(path.join(targetA, '.claude'), { recursive: true });
    await fs.mkdir(path.join(targetB, '.claude'), { recursive: true });

    const asset = makeAsset({ name: 'my-cmd', path: srcFile });
    const repos = [
      makeRepo({ name: 'a', path: targetA, claudePath: path.join(targetA, '.claude') }),
      makeRepo({ name: 'b', path: targetB, claudePath: path.join(targetB, '.claude') }),
    ];

    const result = await copyAssetToRepos(asset, repos, { mode: 'copy', canonicalBase: '' });
    assert.equal(result.ok, true);
    assert.equal(result.data?.successCount, 2);
    assert.ok(result.message.includes('2 repo(s)'));
  });

  it('reports errors for failed copies', async () => {
    const asset = makeAsset({ name: 'missing', path: '/nonexistent/file.md' });
    const repo = makeRepo({ name: 'target', claudePath: path.join(tmpDir, 'bad-target', '.claude') });

    const result = await copyAssetToRepos(asset, [repo], { mode: 'copy', canonicalBase: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors && result.errors.length > 0);
  });
});

describe('moveAssetToRepo', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-move-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('copies then deletes source', async () => {
    const srcDir = path.join(tmpDir, 'src', '.claude', 'commands');
    await fs.mkdir(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'moveme.md');
    await fs.writeFile(srcFile, '# Move Me');

    const targetDir = path.join(tmpDir, 'target');
    await fs.mkdir(path.join(targetDir, '.claude'), { recursive: true });

    const asset = makeAsset({ name: 'moveme', path: srcFile });
    const target = makeRepo({ name: 'target', path: targetDir, claudePath: path.join(targetDir, '.claude') });

    const result = await moveAssetToRepo(asset, target, { mode: 'copy', canonicalBase: '' });
    assert.equal(result.ok, true);

    // Source should be gone
    await assert.rejects(fs.access(srcFile));
    // Target should exist
    const targetFile = path.join(targetDir, '.claude', 'commands', 'moveme.md');
    await fs.access(targetFile); // should not throw
  });
});
