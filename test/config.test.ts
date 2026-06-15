import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/services/config';
import type { LatticeConfig } from '../src/services/config';

describe('LatticeConfig defaults', () => {
  it('has sensible default values', () => {
    assert.deepEqual(DEFAULT_CONFIG.canonicalPaths, ['~/.assets', '~/.agents']);
    assert.equal(DEFAULT_CONFIG.maxDepth, 4);
    assert.ok(DEFAULT_CONFIG.globalPaths.includes('~/.claude'));
    assert.deepEqual(DEFAULT_CONFIG.roots, []);
    assert.deepEqual(DEFAULT_CONFIG.hiddenRepos, []);
  });

  it('ignoreDirs includes common directories', () => {
    assert.ok(DEFAULT_CONFIG.ignoreDirs.includes('node_modules'));
    assert.ok(DEFAULT_CONFIG.ignoreDirs.includes('.git'));
    assert.ok(DEFAULT_CONFIG.ignoreDirs.includes('dist'));
  });

  it('config shape matches expected interface', () => {
    const config: LatticeConfig = { ...DEFAULT_CONFIG, roots: ['/test'] };
    assert.equal(config.roots.length, 1);
    assert.deepEqual(config.canonicalPaths, ['~/.assets', '~/.agents']);
  });
});
