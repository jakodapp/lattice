import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubUrl, buildCloneUrl } from '../src/services/git-ops';

describe('parseGitHubUrl', () => {
  it('parses full HTTPS URL', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo', branch: undefined, subpath: undefined });
  });

  it('parses URL with .git suffix', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo.git');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo', branch: undefined, subpath: undefined });
  });

  it('parses URL with tree path (branch)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/tree/main');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo', branch: 'main', subpath: undefined });
  });

  it('parses URL with tree path (branch + subpath)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/tree/develop/src/skills');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo', branch: 'develop', subpath: 'src/skills' });
  });

  it('parses shorthand owner/repo', () => {
    const result = parseGitHubUrl('jakoda/filter');
    assert.deepEqual(result, { owner: 'jakoda', repo: 'filter' });
  });

  it('parses SSH URL', () => {
    const result = parseGitHubUrl('git@github.com:owner/repo.git');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo' });
  });

  it('parses SSH URL without .git', () => {
    const result = parseGitHubUrl('git@github.com:owner/repo');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo' });
  });

  it('handles trailing slash', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo', branch: undefined, subpath: undefined });
  });

  it('handles whitespace', () => {
    const result = parseGitHubUrl('  https://github.com/owner/repo  ');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo', branch: undefined, subpath: undefined });
  });

  it('returns undefined for invalid URL', () => {
    assert.equal(parseGitHubUrl('not-a-url'), undefined);
  });

  it('returns undefined for non-GitHub URL', () => {
    assert.equal(parseGitHubUrl('https://gitlab.com/owner/repo'), undefined);
  });

  it('returns undefined for empty string', () => {
    assert.equal(parseGitHubUrl(''), undefined);
  });

  it('handles repo names with dots and hyphens', () => {
    const result = parseGitHubUrl('https://github.com/my-org/my.repo-name');
    assert.deepEqual(result, { owner: 'my-org', repo: 'my.repo-name', branch: undefined, subpath: undefined });
  });

  it('parses blob URL with subpath', () => {
    const result = parseGitHubUrl('https://github.com/supabase/agent-skills/blob/main/skills/supabase');
    assert.deepEqual(result, { owner: 'supabase', repo: 'agent-skills', branch: 'main', subpath: 'skills/supabase' });
  });

  it('parses blob URL pointing to SKILL.md and strips filename', () => {
    const result = parseGitHubUrl('https://github.com/supabase/agent-skills/blob/main/skills/supabase/SKILL.md');
    assert.deepEqual(result, { owner: 'supabase', repo: 'agent-skills', branch: 'main', subpath: 'skills/supabase' });
  });

  it('parses blob URL with only SKILL.md at root subpath', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/blob/main/SKILL.md');
    assert.deepEqual(result, { owner: 'owner', repo: 'repo', branch: 'main', subpath: undefined });
  });

  it('parses nested skill with category folder (mattpocock)', () => {
    const result = parseGitHubUrl('https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md');
    assert.deepEqual(result, { owner: 'mattpocock', repo: 'skills', branch: 'main', subpath: 'skills/productivity/handoff' });
  });

  it('parses tree URL equivalent of nested skill (mattpocock)', () => {
    const result = parseGitHubUrl('https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff');
    assert.deepEqual(result, { owner: 'mattpocock', repo: 'skills', branch: 'main', subpath: 'skills/productivity/handoff' });
  });

  it('parses repo-only URL (mattpocock)', () => {
    const result = parseGitHubUrl('https://github.com/mattpocock/skills');
    assert.deepEqual(result, { owner: 'mattpocock', repo: 'skills', branch: undefined, subpath: undefined });
  });

  it('parses skill at standard depth (anthropics)', () => {
    const result = parseGitHubUrl('https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md');
    assert.deepEqual(result, { owner: 'anthropics', repo: 'skills', branch: 'main', subpath: 'skills/skill-creator' });
  });

  it('parses tree URL equivalent (anthropics)', () => {
    const result = parseGitHubUrl('https://github.com/anthropics/skills/tree/main/skills/skill-creator');
    assert.deepEqual(result, { owner: 'anthropics', repo: 'skills', branch: 'main', subpath: 'skills/skill-creator' });
  });

  it('parses skill inside dot-prefixed category folder (openai)', () => {
    const result = parseGitHubUrl('https://github.com/openai/skills/blob/main/skills/.curated/define-goal/SKILL.md');
    assert.deepEqual(result, { owner: 'openai', repo: 'skills', branch: 'main', subpath: 'skills/.curated/define-goal' });
  });

  it('parses tree URL with dot-prefixed category folder (openai)', () => {
    const result = parseGitHubUrl('https://github.com/openai/skills/tree/main/skills/.curated/define-goal');
    assert.deepEqual(result, { owner: 'openai', repo: 'skills', branch: 'main', subpath: 'skills/.curated/define-goal' });
  });

  it('parses repo-only URL (openai)', () => {
    const result = parseGitHubUrl('https://github.com/openai/skills');
    assert.deepEqual(result, { owner: 'openai', repo: 'skills', branch: undefined, subpath: undefined });
  });
});

describe('buildCloneUrl', () => {
  it('builds HTTPS clone URL', () => {
    const url = buildCloneUrl({ owner: 'jakoda', repo: 'filter' });
    assert.equal(url, 'https://github.com/jakoda/filter.git');
  });
});
