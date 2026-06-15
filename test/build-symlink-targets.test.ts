import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildSymlinkTargets } from '../src/types';
import type { Asset } from '../src/types';

function asset(overrides: Partial<Asset> & { name: string }): Asset {
  return {
    type: 'rule',
    path: `/repo/${overrides.name}.md`,
    isDirectory: false,
    hash: 'abc',
    repoName: 'repo',
    ...overrides,
  };
}

describe('buildSymlinkTargets', () => {
  it('returns empty set when no assets are symlinks', () => {
    const assets = [asset({ name: 'foo' }), asset({ name: 'bar' })];
    assert.equal(buildSymlinkTargets(assets).size, 0);
  });

  it('returns canonicalPath of each symlinked asset', () => {
    const target = '/agents/skills/foo';
    const assets = [
      asset({ name: 'foo', isSymlink: true, canonicalPath: target }),
      asset({ name: 'bar' }),
    ];
    const result = buildSymlinkTargets(assets);
    assert.ok(result.has(target));
    assert.equal(result.size, 1);
  });

  it('excludes symlinks without canonicalPath', () => {
    const assets = [asset({ name: 'foo', isSymlink: true, canonicalPath: undefined })];
    assert.equal(buildSymlinkTargets(assets).size, 0);
  });

  it('covers the dedup use-case: symlink target path is in the set', () => {
    const originalPath = '/repo/.agents/skills/supabase';
    const symlinkAsset = asset({ name: 'supabase', path: '/repo/.claude/skills/supabase', isSymlink: true, canonicalPath: originalPath });
    const originalAsset = asset({ name: 'supabase', path: originalPath, isSymlink: false });
    const targets = buildSymlinkTargets([symlinkAsset, originalAsset]);
    assert.ok(targets.has(originalAsset.path), 'original path should be filtered out');
    assert.ok(!targets.has(symlinkAsset.path), 'symlink itself should not be filtered');
  });

  it('handles multiple symlinks to different targets', () => {
    const assets = [
      asset({ name: 'a', isSymlink: true, canonicalPath: '/global/a' }),
      asset({ name: 'b', isSymlink: true, canonicalPath: '/global/b' }),
      asset({ name: 'c' }),
    ];
    const result = buildSymlinkTargets(assets);
    assert.deepEqual([...result].sort(), ['/global/a', '/global/b']);
  });
});
