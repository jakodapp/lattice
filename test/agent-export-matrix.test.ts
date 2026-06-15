import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getExportRule, computeExportTargets, extractTitle, withSourceMarker, LATTICE_SOURCE_RE } from '../src/services/agent-export-matrix';
import { getAgent } from '../src/services/agent-defs';
import type { AgentDef } from '../src/services/agent-defs';
import type { SerializedRepo } from '../src/webview/types';

const agent = (id: string) => {
  const def = getAgent(id);
  assert.ok(def, `agent ${id} must exist in registry`);
  return def!;
};

describe('getExportRule', () => {
  it('skills symlink into the skills subdir for any agent that has one', () => {
    const rule = getExportRule(agent('codex'), 'skill');
    assert.equal(rule?.method, 'symlink');
    assert.equal(rule?.targetSubdir, 'skills');
    assert.equal(rule?.targetName('audit', 'audit'), 'audit');
  });

  it('skills are incompatible with agents lacking a skills dir', () => {
    const noSkills: AgentDef = {
      id: 'noskills', displayName: 'No Skills', configDir: '.x', skillsSubdir: 'skills', globalDir: '~/.x',
      assetDirs: [{ subdir: 'rules', type: 'rule', extensions: ['.md'] }],
    };
    assert.equal(getExportRule(noSkills, 'skill'), undefined);
  });

  it('cursor rules convert to .mdc', () => {
    const rule = getExportRule(agent('cursor'), 'rule');
    assert.equal(rule?.method, 'convert');
    assert.equal(rule?.targetName('style', 'style.md'), 'style.mdc');
    const out = rule!.convert!('# Style Guide\n\nUse tabs.', 'style', '/src/.claude/rules/style.md');
    assert.match(out, /^---\ndescription: Style Guide\nglobs:\nalwaysApply: false\n---/);
    assert.match(out, LATTICE_SOURCE_RE);
  });

  it('copilot rules convert to .instructions.md with applyTo', () => {
    const rule = getExportRule(agent('copilot'), 'rule');
    assert.equal(rule?.targetName('sec', 'sec.md'), 'sec.instructions.md');
    const out = rule!.convert!('# Security\nbody', 'sec', '/x/sec.md');
    assert.match(out, /applyTo: "\*\*"/);
  });

  it('copilot commands rename-symlink to .prompt.md', () => {
    const rule = getExportRule(agent('copilot'), 'command');
    assert.equal(rule?.method, 'symlink');
    assert.equal(rule?.targetName('deploy', 'deploy.md'), 'deploy.prompt.md');
  });

  it('gemini commands convert to valid toml with escaped quotes', () => {
    const rule = getExportRule(agent('gemini'), 'command');
    const out = rule!.convert!('# Deploy\nrun """now"""', 'deploy', '/x/deploy.md');
    assert.match(out, /description = "Deploy"/);
    assert.match(out, /prompt = """/);
    assert.ok(!out.includes('run """now"""'), 'inner triple quotes must be escaped');
  });

  it('default symlink keeps source basename when extension fits', () => {
    const rule = getExportRule(agent('claude'), 'script');
    assert.equal(rule?.targetName('build', 'build.js'), 'build.js');
  });

  it('default symlink renames when extension does not fit', () => {
    const rule = getExportRule(agent('claude'), 'rule');
    assert.equal(rule?.targetName('style', 'style.mdc'), 'style.md');
  });

  it('gemini rules symlink into rules/ after the antigravity merge', () => {
    const rule = getExportRule(agent('gemini'), 'rule');
    assert.equal(rule?.method, 'symlink');
    assert.equal(rule?.targetSubdir, 'rules');
  });

  it('hooks are claude-only', () => {
    assert.equal(getExportRule(agent('cursor'), 'hook'), undefined);
    assert.equal(getExportRule(agent('claude'), 'hook')?.method, 'symlink');
  });
});

describe('extractTitle', () => {
  it('prefers the first H1', () => {
    assert.equal(extractTitle('intro\n\n# Real Title\nbody'), 'Real Title');
  });

  it('skips frontmatter and falls back to first non-empty line', () => {
    assert.equal(extractTitle('---\ndescription: x\n---\n\nFirst line.'), 'First line.');
  });
});

describe('withSourceMarker', () => {
  it('appends a recognizable marker', () => {
    assert.match(withSourceMarker('body', '/a/b.md'), LATTICE_SOURCE_RE);
  });
});

describe('computeExportTargets', () => {
  const repos: SerializedRepo[] = [
    {
      name: '~/.claude', path: '/home/u', claudePath: '/home/u/.claude', isGlobal: true,
      assets: [{ name: 'style', type: 'rule', path: '/home/u/.claude/rules/style.md', isDirectory: false, hash: 'h1', repoName: '~/.claude' }],
    },
    {
      name: '~/.cursor', path: '/home/u', claudePath: '/home/u/.cursor', isGlobal: true,
      assets: [{ name: 'style', type: 'rule', path: '/home/u/.cursor/rules/style.mdc', isDirectory: false, hash: 'h2', repoName: '~/.cursor', tool: 'cursor' }],
    },
    {
      name: 'proj', path: '/w/proj', claudePath: '/w/proj/.claude',
      assets: [{ name: 'deploy', type: 'command', path: '/w/proj/.claude/commands/deploy.md', isDirectory: false, hash: 'h3', repoName: 'proj' }],
    },
  ];

  it('global asset → global scope, marks agents already holding the asset', () => {
    const { scope, targets } = computeExportTargets(repos[0].assets[0], repos);
    assert.equal(scope, 'global');
    assert.equal(targets.find(t => t.agentId === 'claude')?.alreadyInstalled, true);
    assert.equal(targets.find(t => t.agentId === 'cursor')?.alreadyInstalled, true);
    assert.equal(targets.find(t => t.agentId === 'copilot')?.alreadyInstalled, false);
  });

  it('project asset → project scope, only same-repo installs count', () => {
    const { scope, targets } = computeExportTargets(repos[2].assets[0], repos);
    assert.equal(scope, 'project');
    assert.equal(targets.find(t => t.agentId === 'claude')?.alreadyInstalled, true);
    assert.equal(targets.find(t => t.agentId === 'cursor')?.alreadyInstalled, false);
  });

  it('incompatible combos carry a reason', () => {
    const { targets } = computeExportTargets(repos[0].assets[0], repos);
    const codex = targets.find(t => t.agentId === 'codex');
    assert.equal(codex?.compatible, false);
    assert.ok(codex?.reason);
  });

  it('context files are never exportable', () => {
    const asset = { name: 'CLAUDE.md', type: 'claude-md' as const, path: '/w/proj/CLAUDE.md', repoName: 'proj' };
    const { targets } = computeExportTargets(asset, repos);
    assert.ok(targets.every(t => !t.compatible));
  });
});
