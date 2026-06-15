import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildAssetGroups, groupByType, getInstanceStatus } from '../src/services/sync-detector';
import { findMajorityHash, UNREADABLE_HASH } from '../src/constants';
import { Asset, AssetGroup } from '../src/types';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    name: 'test-asset',
    type: 'command',
    path: '/fake/path',
    isDirectory: false,
    hash: 'abc123',
    repoName: 'repo-a',
    ...overrides,
  };
}

describe('buildAssetGroups', () => {
  it('groups assets by type::name', () => {
    const assets = [
      makeAsset({ name: 'audit', type: 'skill', repoName: 'repo-a', hash: 'aaa' }),
      makeAsset({ name: 'audit', type: 'skill', repoName: 'repo-b', hash: 'aaa' }),
      makeAsset({ name: 'mock-first', type: 'command', repoName: 'repo-a', hash: 'bbb' }),
    ];

    const groups = buildAssetGroups(assets);
    assert.equal(groups.length, 2);

    const auditGroup = groups.find(g => g.name === 'audit');
    assert.ok(auditGroup);
    assert.equal(auditGroup.instances.length, 2);
    assert.equal(auditGroup.type, 'skill');
  });

  it('marks single-instance groups as synced', () => {
    const assets = [makeAsset({ name: 'solo', hash: 'xxx' })];
    const groups = buildAssetGroups(assets);
    assert.equal(groups[0].syncStatus, 'synced');
  });

  it('marks same-hash groups as synced', () => {
    const assets = [
      makeAsset({ name: 'shared', repoName: 'a', hash: 'same' }),
      makeAsset({ name: 'shared', repoName: 'b', hash: 'same' }),
    ];
    const groups = buildAssetGroups(assets);
    assert.equal(groups[0].syncStatus, 'synced');
  });

  it('marks different-hash groups as diverged', () => {
    const assets = [
      makeAsset({ name: 'shared', repoName: 'a', hash: 'v1' }),
      makeAsset({ name: 'shared', repoName: 'b', hash: 'v2' }),
    ];
    const groups = buildAssetGroups(assets);
    assert.equal(groups[0].syncStatus, 'diverged');
  });

  it('sorts groups alphabetically by name', () => {
    const assets = [
      makeAsset({ name: 'zebra' }),
      makeAsset({ name: 'alpha' }),
    ];
    const groups = buildAssetGroups(assets);
    assert.equal(groups[0].name, 'alpha');
    assert.equal(groups[1].name, 'zebra');
  });
});

describe('groupByType', () => {
  it('groups asset groups by their type', () => {
    const groups: AssetGroup[] = [
      { name: 'audit', type: 'skill', instances: [], syncStatus: 'synced' },
      { name: 'install', type: 'skill', instances: [], syncStatus: 'synced' },
      { name: 'mock-first', type: 'command', instances: [], syncStatus: 'synced' },
    ];

    const byType = groupByType(groups);
    assert.equal(byType.get('skill')?.length, 2);
    assert.equal(byType.get('command')?.length, 1);
    assert.equal(byType.get('agent'), undefined);
  });
});

describe('getInstanceStatus', () => {
  it('returns unique for single-instance groups', () => {
    const asset = makeAsset({ hash: 'aaa' });
    const group: AssetGroup = { name: 'x', type: 'command', instances: [asset], syncStatus: 'synced' };
    assert.equal(getInstanceStatus(asset, group), 'unique');
  });

  it('returns synced when hash matches majority', () => {
    const a = makeAsset({ repoName: 'a', hash: 'majority' });
    const b = makeAsset({ repoName: 'b', hash: 'majority' });
    const c = makeAsset({ repoName: 'c', hash: 'minority' });
    const group: AssetGroup = { name: 'x', type: 'command', instances: [a, b, c], syncStatus: 'diverged' };

    assert.equal(getInstanceStatus(a, group), 'synced');
    assert.equal(getInstanceStatus(b, group), 'synced');
  });

  it('returns modified when hash is in minority', () => {
    const a = makeAsset({ repoName: 'a', hash: 'majority' });
    const b = makeAsset({ repoName: 'b', hash: 'majority' });
    const c = makeAsset({ repoName: 'c', hash: 'minority' });
    const group: AssetGroup = { name: 'x', type: 'command', instances: [a, b, c], syncStatus: 'diverged' };

    assert.equal(getInstanceStatus(c, group), 'modified');
  });

  it('returns modified for unreadable assets', () => {
    const a = makeAsset({ repoName: 'a', hash: 'aaa' });
    const b = makeAsset({ repoName: 'b', hash: UNREADABLE_HASH });
    const group: AssetGroup = { name: 'x', type: 'command', instances: [a, b], syncStatus: 'diverged' };

    assert.equal(getInstanceStatus(b, group), 'modified');
  });

  it('ignores unreadable hashes when computing majority', () => {
    const a = makeAsset({ repoName: 'a', hash: 'aaa' });
    const b = makeAsset({ repoName: 'b', hash: 'aaa' });
    const c = makeAsset({ repoName: 'c', hash: UNREADABLE_HASH });
    const group: AssetGroup = { name: 'x', type: 'command', instances: [a, b, c], syncStatus: 'diverged' };

    assert.equal(getInstanceStatus(a, group), 'synced');
    assert.equal(getInstanceStatus(b, group), 'synced');
  });

  it('returns modified for all instances when hashes are tied', () => {
    const a = makeAsset({ repoName: 'a', hash: 'v1' });
    const b = makeAsset({ repoName: 'b', hash: 'v2' });
    const group: AssetGroup = { name: 'x', type: 'command', instances: [a, b], syncStatus: 'diverged' };

    assert.equal(getInstanceStatus(a, group), 'modified');
    assert.equal(getInstanceStatus(b, group), 'modified');
  });

  it('returns modified for three-way tie', () => {
    const a = makeAsset({ repoName: 'a', hash: 'v1' });
    const b = makeAsset({ repoName: 'b', hash: 'v2' });
    const c = makeAsset({ repoName: 'c', hash: 'v3' });
    const group: AssetGroup = { name: 'x', type: 'command', instances: [a, b, c], syncStatus: 'diverged' };

    assert.equal(getInstanceStatus(a, group), 'modified');
    assert.equal(getInstanceStatus(b, group), 'modified');
    assert.equal(getInstanceStatus(c, group), 'modified');
  });

  it('returns modified when all instances are unreadable', () => {
    const a = makeAsset({ repoName: 'a', hash: UNREADABLE_HASH });
    const b = makeAsset({ repoName: 'b', hash: UNREADABLE_HASH });
    const group: AssetGroup = { name: 'x', type: 'command', instances: [a, b], syncStatus: 'diverged' };

    assert.equal(getInstanceStatus(a, group), 'modified');
    assert.equal(getInstanceStatus(b, group), 'modified');
  });
});

describe('findMajorityHash', () => {
  it('returns the majority hash when one exists', () => {
    assert.equal(findMajorityHash(['a', 'a', 'b']), 'a');
  });

  it('returns null when hashes are tied', () => {
    assert.equal(findMajorityHash(['a', 'b']), null);
  });

  it('returns null for three-way tie', () => {
    assert.equal(findMajorityHash(['a', 'b', 'c']), null);
  });

  it('ignores unreadable hashes', () => {
    assert.equal(findMajorityHash([UNREADABLE_HASH, 'a', 'a']), 'a');
  });

  it('returns null when all hashes are unreadable', () => {
    assert.equal(findMajorityHash([UNREADABLE_HASH, UNREADABLE_HASH]), null);
  });

  it('returns null for empty input', () => {
    assert.equal(findMajorityHash([]), null);
  });

  it('returns the sole readable hash as majority', () => {
    assert.equal(findMajorityHash([UNREADABLE_HASH, 'a']), 'a');
  });
});
