import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { isCanonicalPath, isCanonicalSymlink, createRelativeSymlink } from '../src/services/symlink-ops';

describe('isCanonicalPath', () => {
  it('returns true for path inside canonical base', () => {
    assert.equal(isCanonicalPath('/home/user/.assets/audit', '/home/user/.assets'), true);
  });

  it('returns false for path outside canonical base', () => {
    assert.equal(isCanonicalPath('/workspace/project/.claude/skills/audit', '/home/user/.assets'), false);
  });

  it('returns false for partial prefix match', () => {
    assert.equal(isCanonicalPath('/home/user/.assets-extra/audit', '/home/user/.assets'), false);
  });
});

describe('createRelativeSymlink', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-symlink-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a relative symlink', async () => {
    const target = path.join(tmpDir, 'source', 'file.md');
    const link = path.join(tmpDir, 'dest', 'file.md');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'hello');

    const created = await createRelativeSymlink(target, link);
    assert.equal(created, true);

    const stats = await fs.lstat(link);
    assert.equal(stats.isSymbolicLink(), true);

    const content = await fs.readFile(link, 'utf-8');
    assert.equal(content, 'hello');
  });

  it('replaces existing symlink with different target', async () => {
    const target1 = path.join(tmpDir, 'src1', 'a.md');
    const target2 = path.join(tmpDir, 'src2', 'a.md');
    const link = path.join(tmpDir, 'link-replace', 'a.md');

    await fs.mkdir(path.dirname(target1), { recursive: true });
    await fs.mkdir(path.dirname(target2), { recursive: true });
    await fs.writeFile(target1, 'v1');
    await fs.writeFile(target2, 'v2');

    await createRelativeSymlink(target1, link);
    await createRelativeSymlink(target2, link);

    const content = await fs.readFile(link, 'utf-8');
    assert.equal(content, 'v2');
  });

  it('returns true if symlink already points to correct target', async () => {
    const target = path.join(tmpDir, 'idempotent', 'file.md');
    const link = path.join(tmpDir, 'idempotent-link', 'file.md');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'data');

    await createRelativeSymlink(target, link);
    const again = await createRelativeSymlink(target, link);
    assert.equal(again, true);
  });
});

describe('isCanonicalSymlink', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-canonical-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns true for symlink pointing to canonical path', async () => {
    const canonical = path.join(tmpDir, 'canonical', 'skill');
    const link = path.join(tmpDir, 'project', 'skill');
    await fs.mkdir(canonical, { recursive: true });
    await createRelativeSymlink(canonical, link);

    assert.equal(await isCanonicalSymlink(link, canonical), true);
  });

  it('returns false for regular file', async () => {
    const file = path.join(tmpDir, 'regular.md');
    await fs.writeFile(file, 'not a symlink');
    assert.equal(await isCanonicalSymlink(file, '/some/canonical'), false);
  });

  it('returns false for nonexistent path', async () => {
    assert.equal(await isCanonicalSymlink('/does/not/exist', '/canonical'), false);
  });
});
