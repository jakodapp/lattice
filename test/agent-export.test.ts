import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exportAssetToAgents } from '../src/services/agent-export';
import { Asset, Repo } from '../src/types';

describe('exportAssetToAgents (project scope)', () => {
  let tmpDir: string;
  let repo: Repo;
  let ruleAsset: Asset;
  let skillAsset: Asset;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lcm-export-'));
    const claudeDir = path.join(tmpDir, '.claude');
    await fs.mkdir(path.join(claudeDir, 'rules'), { recursive: true });
    await fs.mkdir(path.join(claudeDir, 'skills', 'audit'), { recursive: true });
    await fs.writeFile(path.join(claudeDir, 'rules', 'style.md'), '# Style Guide\n\nUse tabs.\n');
    await fs.writeFile(path.join(claudeDir, 'skills', 'audit', 'SKILL.md'), '# Audit\n');

    repo = { name: 'proj', path: tmpDir, claudePath: claudeDir, assets: [] };
    ruleAsset = { name: 'style', type: 'rule', path: path.join(claudeDir, 'rules', 'style.md'), isDirectory: false, hash: 'h', repoName: 'proj' };
    skillAsset = { name: 'audit', type: 'skill', path: path.join(claudeDir, 'skills', 'audit'), isDirectory: true, hash: 'h', repoName: 'proj' };
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('converts a rule to cursor .mdc with frontmatter and marker', async () => {
    const result = await exportAssetToAgents(ruleAsset, { repo }, ['cursor']);
    assert.equal(result.ok, true);
    const out = await fs.readFile(path.join(tmpDir, '.cursor', 'rules', 'style.mdc'), 'utf8');
    assert.match(out, /^---\ndescription: Style Guide/);
    assert.match(out, /lattice:source=/);
  });

  it('re-export overwrites its own generated file (sync)', async () => {
    const result = await exportAssetToAgents(ruleAsset, { repo }, ['cursor']);
    assert.equal(result.ok, true);
  });

  it('refuses to overwrite a non-Lattice file', async () => {
    const target = path.join(tmpDir, '.github', 'instructions', 'style.instructions.md');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'hand-written\n');
    const result = await exportAssetToAgents(ruleAsset, { repo }, ['copilot']);
    assert.equal(result.ok, false);
    assert.equal(await fs.readFile(target, 'utf8'), 'hand-written\n');
  });

  it('symlinks a skill directory into the target skills dir', async () => {
    const result = await exportAssetToAgents(skillAsset, { repo }, ['codex']);
    assert.equal(result.ok, true);
    const link = path.join(tmpDir, '.codex', 'skills', 'audit');
    const stats = await fs.lstat(link);
    assert.ok(stats.isSymbolicLink());
    assert.equal(await fs.realpath(link), await fs.realpath(skillAsset.path));
  });

  it('repeat symlink export is a no-op success', async () => {
    const result = await exportAssetToAgents(skillAsset, { repo }, ['codex']);
    assert.equal(result.ok, true);
  });

  it('refuses to replace a real file at a symlink target', async () => {
    const occupied = path.join(tmpDir, '.agents', 'skills', 'audit');
    await fs.mkdir(occupied, { recursive: true });
    await fs.writeFile(path.join(occupied, 'SKILL.md'), 'different\n');
    const result = await exportAssetToAgents(skillAsset, { repo }, ['agents']);
    assert.equal(result.ok, false);
    assert.equal(await fs.readFile(path.join(occupied, 'SKILL.md'), 'utf8'), 'different\n');
  });

  it('collects per-agent errors while still applying valid targets', async () => {
    const result = await exportAssetToAgents(ruleAsset, { repo }, ['gemini', 'codex']);
    // gemini rule = plain .md symlink (valid); codex has no rules dir (error)
    assert.equal(result.ok, true);
    assert.equal(result.errors?.length, 1);
    assert.equal(result.errors?.[0].target, 'codex');
  });
});
