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
});
