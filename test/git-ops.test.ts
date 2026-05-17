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
});

describe('buildCloneUrl', () => {
  it('builds HTTPS clone URL', () => {
    const url = buildCloneUrl({ owner: 'jakoda', repo: 'filter' });
    assert.equal(url, 'https://github.com/jakoda/filter.git');
  });
});
