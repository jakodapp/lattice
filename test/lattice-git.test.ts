import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { LatticeGit } from '../src/services/lattice-git';

describe('LatticeGit', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-git-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('initializes a git repo', async () => {
    const dir = path.join(tmpDir, 'init-test');
    const git = new LatticeGit(dir);
    await git.ensureRepo();

    // .git should exist
    const stat = await fs.stat(path.join(dir, '.git'));
    assert.ok(stat.isDirectory());

    // .gitignore should exist
    const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf-8');
    assert.ok(gitignore.includes('*.tmp'));
  });

  it('does not reinitialize existing repo', async () => {
    const dir = path.join(tmpDir, 'reinit-test');
    const git = new LatticeGit(dir);
    await git.ensureRepo();

    // Add a context.json and commit (commit() stages context.json)
    await fs.writeFile(path.join(dir, 'context.json'), '{"version":1}');
    await git.commit('add context');

    // ensureRepo again should not reset
    await git.ensureRepo();
    const log = await git.log();
    assert.ok(log.length >= 2, 'should have both init + context commits');
  });

  it('commits only when there are changes', async () => {
    const dir = path.join(tmpDir, 'commit-test');
    const git = new LatticeGit(dir);
    await git.ensureRepo();

    const logBefore = await git.log();
    await git.commit('no-op'); // nothing to commit
    const logAfter = await git.log();

    assert.equal(logBefore.length, logAfter.length, 'should not create empty commit');
  });

  it('commits context.json changes', async () => {
    const dir = path.join(tmpDir, 'ctx-commit');
    const git = new LatticeGit(dir);
    await git.ensureRepo();

    await fs.writeFile(path.join(dir, 'context.json'), '{"version":1}');
    await git.commit('test: wrote context');

    const log = await git.log();
    assert.ok(log.some(e => e.message === 'test: wrote context'));
  });

  it('returns commit log entries', async () => {
    const dir = path.join(tmpDir, 'log-test');
    const git = new LatticeGit(dir);
    await git.ensureRepo();

    const log = await git.log();
    assert.ok(log.length >= 1);
    assert.ok(log[0].hash.length > 0);
    assert.ok(log[0].message.length > 0);
    assert.ok(log[0].date.length > 0);
  });

  it('respects log count limit', async () => {
    const dir = path.join(tmpDir, 'limit-test');
    const git = new LatticeGit(dir);
    await git.ensureRepo();

    // Create multiple commits
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(dir, 'context.json'), `{"v":${i}}`);
      await git.commit(`commit ${i}`);
    }

    const limited = await git.log(2);
    assert.equal(limited.length, 2);
  });
});
