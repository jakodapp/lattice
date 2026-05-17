import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface CommitEntry {
  hash: string;
  message: string;
  date: string;
}

export class LatticeGit {
  constructor(private latticeDir: string) {}

  /** Initialize a git repo at latticeDir if one doesn't exist */
  async ensureRepo(): Promise<void> {
    await fs.mkdir(this.latticeDir, { recursive: true });
    const gitDir = path.join(this.latticeDir, '.git');
    try {
      await fs.access(gitDir);
    } catch {
      await execFileAsync('git', ['init'], { cwd: this.latticeDir });
      // Create .gitignore to keep it clean
      await fs.writeFile(
        path.join(this.latticeDir, '.gitignore'),
        '*.tmp\n',
        'utf-8',
      );
      await execFileAsync('git', ['add', '.'], { cwd: this.latticeDir });
      await execFileAsync('git', ['commit', '-m', 'init: lattice context store'], { cwd: this.latticeDir });
    }
  }

  /** Stage context.json and commit with the given message */
  async commit(message: string): Promise<void> {
    try {
      // Stage context.json (handles both new and modified)
      await execFileAsync('git', ['add', 'context.json', 'config.json'], { cwd: this.latticeDir }).catch((err) => { console.debug('[LCM] git add config.json skipped:', err instanceof Error ? err.message : err); });
      await execFileAsync('git', ['add', 'context.json'], { cwd: this.latticeDir });

      // Check if there are changes to commit
      const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-only'], { cwd: this.latticeDir });
      if (!stdout.trim()) return;

      await execFileAsync('git', ['commit', '-m', message], { cwd: this.latticeDir });
    } catch (err) {
      console.debug('[LCM] Git commit skipped:', err instanceof Error ? err.message : err);
    }
  }

  /** Get recent commit history */
  async log(count = 20): Promise<CommitEntry[]> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', `--max-count=${count}`, '--format=%H\t%s\t%aI'],
        { cwd: this.latticeDir },
      );
      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const [hash, message, date] = line.split('\t');
        return { hash, message, date };
      });
    } catch {
      return [];
    }
  }
}
