import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { getErrorMessage } from '../constants';
import { CcmError } from '../errors';

const execFileAsync = promisify(execFile);

export interface CloneResult {
  localPath: string;
  repoName: string;
}

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
}

/**
 * Parse a GitHub URL into its components.
 * Supports: full URLs, .git suffix, tree paths, shorthand owner/repo.
 */
export function parseGitHubUrl(input: string): ParsedGitHubUrl | undefined {
  const trimmed = input.trim().replace(/\/+$/, '');

  // Shorthand: owner/repo
  const shorthand = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/.exec(trimmed);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }

  // Full URL: https://github.com/owner/repo[.git][/tree/branch[/subpath]]
  const urlPattern = /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;
  const match = urlPattern.exec(trimmed);
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
      branch: match[3],
      subpath: match[4],
    };
  }

  // SSH: git@github.com:owner/repo.git
  const sshPattern = /^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/;
  const sshMatch = sshPattern.exec(trimmed);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return undefined;
}

/** Build the HTTPS clone URL from parsed components */
export function buildCloneUrl(parsed: ParsedGitHubUrl): string {
  return `https://github.com/${parsed.owner}/${parsed.repo}.git`;
}

/** Shallow-clone a GitHub repository to a temp directory */
export async function shallowClone(url: string, branch?: string): Promise<CloneResult> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new CcmError(`Invalid GitHub URL: ${url}`, 'CLONE_FAILED', { url });
  }

  const id = crypto.randomBytes(6).toString('hex');
  const localPath = path.join(os.tmpdir(), `lattice-clone-${id}`);
  const cloneUrl = buildCloneUrl(parsed);

  const args = ['clone', '--depth', '1', '--single-branch'];
  if (branch ?? parsed.branch) {
    args.push('--branch', (branch ?? parsed.branch)!);
  }
  args.push(cloneUrl, localPath);

  try {
    await execFileAsync('git', args, { timeout: 60_000 });
  } catch (err) {
    // Clean up partial clone
    await cleanupClone(localPath);
    const msg = getErrorMessage(err);
    throw new CcmError(`Failed to clone ${cloneUrl}: ${msg}`, 'CLONE_FAILED', { url: cloneUrl });
  }

  return { localPath, repoName: parsed.repo };
}

/** Remove a cloned temp directory */
export async function cleanupClone(localPath: string): Promise<void> {
  // Safety: only delete from temp directory
  if (!localPath.startsWith(os.tmpdir())) return;
  try {
    await fs.rm(localPath, { recursive: true, force: true });
  } catch (err) { console.debug(`[LCM] Clone cleanup failed for ${localPath}:`, getErrorMessage(err)); }
}

/** Get HEAD commit hash from a local git repository */
export async function getHeadCommit(repoPath: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, timeout: 10_000 });
  return stdout.trim();
}
