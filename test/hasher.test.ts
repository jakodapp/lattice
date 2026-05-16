import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { hashFile, hashDirectory } from '../src/services/hasher';

describe('hashFile', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-test-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns consistent hash for same content', async () => {
    const file = path.join(tmpDir, 'a.txt');
    await fs.writeFile(file, 'hello world');
    const hash1 = await hashFile(file);
    const hash2 = await hashFile(file);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  it('returns different hash for different content', async () => {
    const file1 = path.join(tmpDir, 'b1.txt');
    const file2 = path.join(tmpDir, 'b2.txt');
    await fs.writeFile(file1, 'content A');
    await fs.writeFile(file2, 'content B');
    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);
    assert.notEqual(hash1, hash2);
  });
});

describe('hashDirectory', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-test-dir-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('produces same hash for identical directory contents', async () => {
    const dir1 = path.join(tmpDir, 'dir1');
    const dir2 = path.join(tmpDir, 'dir2');
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    await fs.writeFile(path.join(dir1, 'SKILL.md'), '# Skill A');
    await fs.writeFile(path.join(dir1, 'ref.md'), 'Reference doc');
    await fs.writeFile(path.join(dir2, 'SKILL.md'), '# Skill A');
    await fs.writeFile(path.join(dir2, 'ref.md'), 'Reference doc');

    const hash1 = await hashDirectory(dir1);
    const hash2 = await hashDirectory(dir2);
    assert.equal(hash1, hash2);
  });

  it('produces different hash when contents differ', async () => {
    const dir1 = path.join(tmpDir, 'diff1');
    const dir2 = path.join(tmpDir, 'diff2');
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    await fs.writeFile(path.join(dir1, 'SKILL.md'), '# Version 1');
    await fs.writeFile(path.join(dir2, 'SKILL.md'), '# Version 2');

    const hash1 = await hashDirectory(dir1);
    const hash2 = await hashDirectory(dir2);
    assert.notEqual(hash1, hash2);
  });

  it('handles nested directories', async () => {
    const dir = path.join(tmpDir, 'nested');
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(dir, 'top.md'), 'top');
    await fs.writeFile(path.join(dir, 'sub', 'deep.md'), 'deep');

    const hash = await hashDirectory(dir);
    assert.equal(hash.length, 64);
  });
});
