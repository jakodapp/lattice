import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ContextFile } from '../src/services/context-store';

const execFileAsync = promisify(execFile);
const CLI = path.join(__dirname, '..', 'dist', 'cli.js');

/* ── Helpers ─────────────────────────────────────────────────────────── */

async function lattice(
  args: string[],
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], {
      env: { ...process.env, ...env },
      timeout: 30_000,
    });
    return { stdout, stderr, code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

async function readContext(latticeDir: string): Promise<ContextFile> {
  const raw = await fs.readFile(path.join(latticeDir, 'context.json'), 'utf-8');
  return JSON.parse(raw);
}

async function gitLog(latticeDir: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['log', '--oneline', '--no-decorate'], { cwd: latticeDir });
  return stdout.trim().split('\n').filter(Boolean);
}

async function gitLastMessage(latticeDir: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%s'], { cwd: latticeDir });
  return stdout.trim();
}

async function gitStatus(latticeDir: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['status', '--short'], { cwd: latticeDir });
  return stdout.trim();
}

/** Assert the latest commit message contains the expected substring and working tree is clean */
async function assertCommit(latticeDir: string, expected: string): Promise<void> {
  const status = await gitStatus(latticeDir);
  assert.equal(status, '', `working tree should be clean after "${expected}"`);
  const msg = await gitLastMessage(latticeDir);
  assert.ok(msg.includes(expected), `last commit should contain "${expected}", got: "${msg}"`);
}

/* ── Full Lifecycle Test ─────────────────────────────────────────────── */

// Fixed path outside project so the test repo persists for inspection
const E2E_DIR = '/Users/jael/Workplace/jakoda/e2e';

describe('CLI lifecycle', () => {
  let tmpDir: string;
  let canonical: string;
  let latticeDir: string;
  let configPath: string;
  let workspace: string;
  let env: Record<string, string>;

  before(async () => {
    // Clean up previous test run
    await fs.rm(E2E_DIR, { recursive: true, force: true });

    tmpDir = E2E_DIR;
    canonical = path.join(tmpDir, '.assets');
    latticeDir = path.join(canonical, '.lattice');
    configPath = path.join(latticeDir, 'config.json');
    workspace = path.join(tmpDir, 'workspace');
    env = { LATTICE_CONFIG: configPath };
  });

  // No after() cleanup — the .e2e-workspace/ persists for inspection.
  // It gets cleaned on the NEXT test run in before().

  /* ── 1. Setup workspace and canonical space ── */

  it('1. sets up workspace and canonical space', async () => {
    // Create canonical with one shared skill
    const skillDir = path.join(canonical, 'skills', 'shared-audit');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Shared Audit\nAudit code quality across repos.');

    // Create canonical command
    await fs.mkdir(path.join(canonical, 'commands'), { recursive: true });
    await fs.writeFile(path.join(canonical, 'commands', 'deploy.md'), '# Deploy\nDeploy to production.');

    // Create two repos
    for (const name of ['alpha', 'beta']) {
      const claudePath = path.join(workspace, name, '.claude');
      await fs.mkdir(path.join(claudePath, 'commands'), { recursive: true });
      await fs.mkdir(path.join(claudePath, 'rules'), { recursive: true });
      await fs.writeFile(path.join(claudePath, 'commands', 'build.md'), `# Build ${name}\nBuild the ${name} project.`);
      await fs.writeFile(path.join(claudePath, 'rules', 'style.md'), '# Style\nUse consistent formatting.');
    }

    // Write CLI config
    await fs.mkdir(latticeDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({
      roots: [workspace],
      canonicalPath: canonical,
      maxDepth: 4,
      ignoreDirs: ['node_modules', '.git'],
      scanGlobal: false,
      installMode: 'copy',
    }, null, 2));

    // Init .lattice git repo
    await execFileAsync('git', ['init'], { cwd: latticeDir });
    await execFileAsync('git', ['add', '.'], { cwd: latticeDir });
    await execFileAsync('git', ['commit', '-m', 'init: test workspace'], { cwd: latticeDir });

    // First scan
    const { stdout, code } = await lattice(['scan'], env);
    assert.equal(code, 0, `scan failed: ${stdout}`);
    assert.ok(stdout.includes('alpha'), 'should discover alpha');
    assert.ok(stdout.includes('beta'), 'should discover beta');

    // Verify context.json
    const ctx = await readContext(latticeDir);
    assert.ok(ctx.assets.length >= 4, `expected >= 4 assets, got ${ctx.assets.length}`);
    assert.ok(ctx.assets.some(a => a.name === 'shared-audit' && a.type === 'skill'), 'should track canonical skill');
    assert.ok(ctx.assets.some(a => a.name === 'deploy' && a.type === 'command'), 'should track canonical command');
    assert.ok(ctx.assets.some(a => a.name === 'build' && a.type === 'command'), 'should track build from repos');
    assert.ok(ctx.assets.some(a => a.name === 'style' && a.type === 'rule'), 'should track style rule');

    // Verify git commit
    await assertCommit(latticeDir, 'scan:');
    const log = await gitLog(latticeDir);
    assert.ok(log.length === 2, `should have init + scan commits, got ${log.length}: ${log.join(' | ')}`);
  });

  /* ── 2. Add a new repo ── */

  it('2. discovers a new repo when added', async () => {
    const gammaPath = path.join(workspace, 'gamma', '.claude', 'commands');
    await fs.mkdir(gammaPath, { recursive: true });
    await fs.writeFile(path.join(gammaPath, 'lint.md'), '# Lint\nRun linter.');

    const { code } = await lattice(['scan'], env);
    assert.equal(code, 0);

    const ctx = await readContext(latticeDir);
    assert.ok(ctx.assets.some(a => a.name === 'lint'), 'should track gamma lint command');

    const lint = ctx.assets.find(a => a.name === 'lint')!;
    assert.ok(lint.installations.some(i => i.repoName.includes('gamma')), 'lint should be installed in gamma');

    await assertCommit(latticeDir, 'scan:');
  });

  /* ── 3. Create a local asset ── */

  it('3. tracks a new local asset after scan', async () => {
    // Add a rule directly to alpha
    await fs.writeFile(
      path.join(workspace, 'alpha', '.claude', 'rules', 'security.md'),
      '# Security\nNever trust user input.',
    );

    const { code } = await lattice(['scan'], env);
    assert.equal(code, 0);

    const ctx = await readContext(latticeDir);
    const security = ctx.assets.find(a => a.name === 'security' && a.type === 'rule');
    assert.ok(security, 'should track new security rule');
    assert.ok(security!.installations.some(i => i.repoName.includes('alpha')), 'security should be in alpha');
    assert.equal(security!.installations.length, 1, 'security should only be in alpha');

    await assertCommit(latticeDir, 'scan:');
  });

  /* ── 4. Create a symlinked asset ── */

  it('4. tracks symlinked assets with mode: symlink', async () => {
    // Symlink canonical skill into alpha
    const target = path.join(canonical, 'skills', 'shared-audit');
    const link = path.join(workspace, 'alpha', '.claude', 'skills');
    await fs.mkdir(link, { recursive: true });
    const linkPath = path.join(link, 'shared-audit');
    const relativePath = path.relative(path.dirname(linkPath), target);
    await fs.symlink(relativePath, linkPath);

    const { code } = await lattice(['scan'], env);
    assert.equal(code, 0);

    const ctx = await readContext(latticeDir);
    const audit = ctx.assets.find(a => a.name === 'shared-audit' && a.type === 'skill');
    assert.ok(audit, 'should track shared-audit');

    const alphaInstall = audit!.installations.find(i => i.repoName.includes('alpha'));
    assert.ok(alphaInstall, 'shared-audit should be installed in alpha');
    assert.equal(alphaInstall!.mode, 'symlink', 'alpha installation should be symlink mode');
    assert.equal(alphaInstall!.synced, true, 'symlink should be synced with canonical');

    await assertCommit(latticeDir, 'scan:');
  });

  /* ── 5. Copy/install assets to another repo ── */

  it('5a. copies a local asset to another repo', async () => {
    const { stdout, code } = await lattice(['copy', 'security', '--to', 'beta'], env);
    assert.equal(code, 0, `copy failed: ${stdout}`);

    // Verify file exists at target
    const targetFile = path.join(workspace, 'beta', '.claude', 'rules', 'security.md');
    const content = await fs.readFile(targetFile, 'utf-8');
    assert.ok(content.includes('Never trust user input'), 'copied file should have original content');

    // Verify context updated
    await lattice(['scan'], env); // refresh context
    const ctx = await readContext(latticeDir);
    const security = ctx.assets.find(a => a.name === 'security' && a.type === 'rule');
    assert.ok(security!.installations.length >= 2, 'security should now be in alpha + beta');

    await assertCommit(latticeDir, 'copy:');
  });

  it('5b. installs canonical asset to a repo via symlink', async () => {
    // Install the canonical deploy command to gamma
    const { stdout, code } = await lattice(['install', 'deploy', '--to', 'gamma'], env);
    assert.equal(code, 0, `install failed: ${stdout}`);

    // Verify file exists at target
    const targetFile = path.join(workspace, 'gamma', '.claude', 'commands', 'deploy.md');
    const content = await fs.readFile(targetFile, 'utf-8');
    assert.ok(content.includes('Deploy to production'), 'installed file should have canonical content');

    await assertCommit(latticeDir, 'install:');
  });

  /* ── 6. Remove asset from repo ── */

  it('6. removes a specific asset from a repo', async () => {
    // Remove the security rule from beta
    const { code } = await lattice(['remove', 'beta', 'security'], env);
    assert.equal(code, 0);

    // Verify file is gone
    const targetFile = path.join(workspace, 'beta', '.claude', 'rules', 'security.md');
    await assert.rejects(fs.access(targetFile), 'security rule should be deleted from beta');

    // Verify context updated
    await lattice(['scan'], env);
    const ctx = await readContext(latticeDir);
    const security = ctx.assets.find(a => a.name === 'security' && a.type === 'rule');
    assert.ok(security, 'security should still exist (in alpha)');
    assert.ok(!security!.installations.some(i => i.repoName.includes('beta')), 'beta should no longer have security');

    await assertCommit(latticeDir, 'remove:');
  });

  /* ── 7. Delete asset completely ── */

  it('7. deletes an asset completely from all repos', async () => {
    // Add a disposable asset to multiple repos
    for (const name of ['alpha', 'beta']) {
      await fs.writeFile(
        path.join(workspace, name, '.claude', 'commands', 'throwaway.md'),
        '# Throwaway\nTemporary command.',
      );
    }
    await lattice(['scan'], env);

    // Remove from alpha
    const { code: c1 } = await lattice(['remove', 'alpha', 'throwaway'], env);
    assert.equal(c1, 0);

    // Remove from beta
    const { code: c2 } = await lattice(['remove', 'beta', 'throwaway'], env);
    assert.equal(c2, 0);

    // Verify it's gone everywhere
    await assert.rejects(fs.access(path.join(workspace, 'alpha', '.claude', 'commands', 'throwaway.md')));
    await assert.rejects(fs.access(path.join(workspace, 'beta', '.claude', 'commands', 'throwaway.md')));

    // After scan, throwaway should have no installations in alpha or beta
    await lattice(['scan'], env);
    const ctx = await readContext(latticeDir);
    const throwaway = ctx.assets.find(a => a.name === 'throwaway');
    if (throwaway) {
      const remaining = throwaway.installations.filter(i =>
        i.repoName.includes('alpha') || i.repoName.includes('beta'),
      );
      assert.equal(remaining.length, 0, 'throwaway should be gone from alpha and beta');
    }

    // Last mutating operation was "remove: throwaway from beta"
    await assertCommit(latticeDir, 'remove:');
  });

  /* ── 8. Remove repo ── */

  it('8. removes all assets from a repo', async () => {
    // Count gamma assets before
    let ctx = await readContext(latticeDir);
    const gammaAssetsBefore = ctx.assets.filter(a =>
      a.installations.some(i => i.repoName.includes('gamma')),
    );
    assert.ok(gammaAssetsBefore.length > 0, 'gamma should have assets before removal');

    // Remove all assets from gamma
    const { code } = await lattice(['remove', 'gamma'], env);
    assert.equal(code, 0);

    // Verify gamma .claude/ is now empty
    const gammaCommands = path.join(workspace, 'gamma', '.claude', 'commands');
    try {
      const entries = await fs.readdir(gammaCommands);
      assert.equal(entries.length, 0, 'gamma commands should be empty');
    } catch {
      // Directory deleted entirely — also fine
    }

    // Verify context: gamma shouldn't have the removed assets
    await lattice(['scan'], env);
    ctx = await readContext(latticeDir);
    // gamma's .claude/ dir still exists (just empty), so it's still scanned.
    // But the removed assets should not have gamma installations.
    for (const asset of gammaAssetsBefore) {
      const current = ctx.assets.find(a => a.name === asset.name && a.type === asset.type);
      if (current) {
        const gammaInstall = current.installations.filter(i => i.repoName.includes('gamma'));
        assert.equal(gammaInstall.length, 0, `${asset.name} should not be in gamma after removal`);
      }
    }

    await assertCommit(latticeDir, 'remove:');
  });

  /* ── 9. Install from GitHub ── */

  it('9. lattice sync detects GitHub-sourced assets', async () => {
    // Simulate a GitHub install by manually cloning the skill
    // and recording source metadata (the real flow goes through the extension webview)
    const { ContextStore } = await import('../src/services/context-store');
    const { shallowClone, cleanupClone, getHeadCommit } = await import('../src/services/git-ops');
    const { discoverAssets } = await import('../src/services/github-import');
    const { hashDirectory } = await import('../src/services/hasher');

    const githubUrl = 'https://github.com/anthropics/skills';
    let clonePath: string;

    try {
      const clone = await shallowClone(githubUrl);
      clonePath = clone.localPath;
    } catch {
      // No network — skip this test gracefully
      console.log('    ⚠ Skipping GitHub test (no network)');
      return;
    }

    try {
      const commitHash = await getHeadCommit(clonePath).catch(() => 'unknown');
      const discovered = await discoverAssets(clonePath);
      const webappTesting = discovered.find(a => a.name === 'webapp-testing');

      if (!webappTesting) {
        console.log('    ⚠ webapp-testing skill not found in clone');
        return;
      }

      // Copy skill to canonical
      const targetDir = path.join(canonical, 'skills', 'webapp-testing');
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      await fs.cp(webappTesting.sourcePath, targetDir, { recursive: true });

      // Record source metadata in context store
      const store = new ContextStore(latticeDir);
      await store.load();
      const hash = await hashDirectory(targetDir);
      store.trackAsset({
        name: 'webapp-testing',
        type: 'skill',
        canonicalHash: hash,
        modifiedAt: new Date().toISOString(),
        installations: [],
        source: {
          url: githubUrl,
          commitHash,
          ref: 'main',
          fetchedAt: new Date().toISOString(),
        },
      });
      await store.save();

      // Commit the manual change
      const { LatticeGit } = await import('../src/services/lattice-git');
      const git = new LatticeGit(latticeDir);
      await git.commit('github-install: webapp-testing from anthropics/skills');

      // Verify context has source metadata
      const ctx = await readContext(latticeDir);
      const tracked = ctx.assets.find(a => a.name === 'webapp-testing');
      assert.ok(tracked, 'webapp-testing should be tracked');
      assert.ok(tracked!.source, 'should have source metadata');
      assert.equal(tracked!.source!.url, githubUrl);
      assert.ok(tracked!.source!.commitHash.length > 0, 'should have commit hash');

      // Refresh context via scan
      await lattice(['scan'], env);

      // Verify lattice sync recognizes it
      const { stdout: syncOut, code: syncCode } = await lattice(['sync', 'webapp-testing'], env);
      assert.equal(syncCode, 0, `sync failed: ${syncOut}`);
      assert.ok(
        syncOut.includes('webapp-testing') || syncOut.includes('up to date') || syncOut.includes('updated'),
        'sync should report on webapp-testing',
      );

      await assertCommit(latticeDir, 'github-install:');
    } finally {
      await cleanupClone(clonePath!);
    }
  });

  /* ── Final: Verify git history tells the full story ── */

  it('final: git history is a complete audit trail', async () => {
    const log = await gitLog(latticeDir);

    // Should have commits from: init, scan(x~5), copy, install, remove(x~3), github-install, sync
    assert.ok(log.length >= 8, `expected >= 8 commits, got ${log.length}`);

    // Verify the history contains all operation types
    const history = log.join('\n');
    assert.ok(history.includes('init:'), 'history should have init commit');
    assert.ok(history.includes('scan:'), 'history should have scan commits');
    assert.ok(history.includes('copy:'), 'history should have copy commit');
    assert.ok(history.includes('install:'), 'history should have install commit');
    assert.ok(history.includes('remove:'), 'history should have remove commit');

    // Working tree must be clean
    const status = await gitStatus(latticeDir);
    assert.equal(status, '', 'working tree should be clean at the end');

    // Print the full history for visibility
    console.log(`\n    Git audit trail (${log.length} commits):`);
    for (const entry of log.reverse()) {
      console.log(`      ${entry}`);
    }
  });
});
