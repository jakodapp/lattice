/** Expand ~ to home directory */
export function expandHome(p: string): string {
  return p.replace(/^~/, process.env.HOME ?? '~');
}

export interface LatticeConfig {
  roots: string[];
  canonicalPaths: string[];
  globalPaths: string[];
  maxDepth: number;
  ignoreDirs: string[];
  hiddenRepos: string[];
}

export const DEFAULT_CONFIG: LatticeConfig = {
  roots: [],
  canonicalPaths: ['~/.assets', '~/.agents'],
  globalPaths: ['~/.claude', '~/.cursor', '~/.github'],
  maxDepth: 4,
  ignoreDirs: [
    'node_modules', '.git', 'dist', 'build', 'vendor',
    '.next', '.nuxt', 'coverage', '.dart_tool', '.pub-cache',
  ],
  hiddenRepos: [],
};
