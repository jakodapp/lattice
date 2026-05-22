import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { enumerateAssetDir } from '../src/services/asset-enumerator';

describe('enumerateAssetDir', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-enum-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('discovers markdown files as assets', async () => {
    const dir = path.join(tmpDir, 'commands');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'deploy.md'), '# Deploy');
    await fs.writeFile(path.join(dir, 'build.md'), '# Build');

    const items = await enumerateAssetDir(dir, 'command');
    assert.equal(items.length, 2);
    assert.ok(items.some(i => i.name === 'deploy' && i.type === 'command' && !i.isDirectory));
    assert.ok(items.some(i => i.name === 'build'));
  });

  it('discovers .js files as assets', async () => {
    const dir = path.join(tmpDir, 'scripts');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'setup.js'), 'console.log("hi")');

    const items = await enumerateAssetDir(dir, 'script');
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'setup');
  });

  it('discovers skill directories', async () => {
    const dir = path.join(tmpDir, 'skills');
    const skillDir = path.join(dir, 'audit');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Audit Skill');

    const items = await enumerateAssetDir(dir, 'skill');
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'audit');
    assert.equal(items[0].isDirectory, true);
  });

  it('recurses into non-skill directories', async () => {
    const dir = path.join(tmpDir, 'rules');
    const nested = path.join(dir, 'security');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, 'xss.md'), '# XSS Rule');
    await fs.writeFile(path.join(dir, 'code-style.md'), '# Style');

    const items = await enumerateAssetDir(dir, 'rule');
    assert.equal(items.length, 2);
    assert.ok(items.some(i => i.name === 'xss'));
    assert.ok(items.some(i => i.name === 'code-style'));
  });

  it('skips hidden files and Thumbs.db', async () => {
    const dir = path.join(tmpDir, 'hidden');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, '.DS_Store'), '');
    await fs.writeFile(path.join(dir, 'Thumbs.db'), '');
    await fs.writeFile(path.join(dir, 'valid.md'), '# Valid');

    const items = await enumerateAssetDir(dir, 'command');
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'valid');
  });

  it('skips non-md/js files', async () => {
    const dir = path.join(tmpDir, 'mixed');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'valid.md'), '# ok');
    await fs.writeFile(path.join(dir, 'image.png'), 'binary');
    await fs.writeFile(path.join(dir, 'data.json'), '{}');

    const items = await enumerateAssetDir(dir, 'command');
    assert.equal(items.length, 1);
  });

  it('returns empty for nonexistent directory', async () => {
    const items = await enumerateAssetDir('/nonexistent/path', 'command');
    assert.equal(items.length, 0);
  });

  // --- Recursive skill detection via SKILL.md ---

  it('discovers nested skills inside category folders', async () => {
    const dir = path.join(tmpDir, 'nested-skills');
    const catDir = path.join(dir, 'engineering');
    await fs.mkdir(path.join(catDir, 'tdd'), { recursive: true });
    await fs.mkdir(path.join(catDir, 'prototype'), { recursive: true });
    await fs.writeFile(path.join(catDir, 'tdd', 'SKILL.md'), '# TDD');
    await fs.writeFile(path.join(catDir, 'prototype', 'SKILL.md'), '# Prototype');

    const items = await enumerateAssetDir(dir, 'skill');
    assert.equal(items.length, 2);
    assert.ok(items.some(i => i.name === 'tdd' && i.isDirectory));
    assert.ok(items.some(i => i.name === 'prototype' && i.isDirectory));
    // Category folder itself should NOT appear
    assert.ok(!items.some(i => i.name === 'engineering'));
  });

  it('discovers skills at mixed depths', async () => {
    const dir = path.join(tmpDir, 'mixed-depth');
    await fs.mkdir(path.join(dir, 'direct-skill'), { recursive: true });
    await fs.writeFile(path.join(dir, 'direct-skill', 'SKILL.md'), '# Direct');
    await fs.mkdir(path.join(dir, 'category', 'nested-skill'), { recursive: true });
    await fs.writeFile(path.join(dir, 'category', 'nested-skill', 'SKILL.md'), '# Nested');

    const items = await enumerateAssetDir(dir, 'skill');
    assert.equal(items.length, 2);
    assert.ok(items.some(i => i.name === 'direct-skill'));
    assert.ok(items.some(i => i.name === 'nested-skill'));
  });

  it('discovers skills inside dot-prefixed category folders', async () => {
    const dir = path.join(tmpDir, 'dot-categories');
    await fs.mkdir(path.join(dir, '.curated', 'pdf'), { recursive: true });
    await fs.writeFile(path.join(dir, '.curated', 'pdf', 'SKILL.md'), '# PDF');

    const items = await enumerateAssetDir(dir, 'skill');
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'pdf');
  });

  it('returns empty for category folder with no skills', async () => {
    const dir = path.join(tmpDir, 'empty-category');
    await fs.mkdir(path.join(dir, 'placeholder'), { recursive: true });
    // No SKILL.md anywhere

    const items = await enumerateAssetDir(dir, 'skill');
    assert.equal(items.length, 0);
  });

  it('discovers deeply nested skills', async () => {
    const dir = path.join(tmpDir, 'deep-nesting');
    const deepPath = path.join(dir, 'a', 'b', 'c', 'deep-skill');
    await fs.mkdir(deepPath, { recursive: true });
    await fs.writeFile(path.join(deepPath, 'SKILL.md'), '# Deep');

    const items = await enumerateAssetDir(dir, 'skill');
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'deep-skill');
  });

  it('respects maxDepth limit for skill recursion', async () => {
    const dir = path.join(tmpDir, 'depth-limit');
    const deepPath = path.join(dir, 'a', 'b', 'c', 'too-deep');
    await fs.mkdir(deepPath, { recursive: true });
    await fs.writeFile(path.join(deepPath, 'SKILL.md'), '# Too Deep');

    // maxDepth=2 means: dir(0) → a(1) → b(2) → stop
    const items = await enumerateAssetDir(dir, 'skill', 2);
    assert.equal(items.length, 0);
  });
});
