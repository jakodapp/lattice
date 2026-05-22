export type InstallMode = 'copy' | 'symlink';

/** Expand ~ to home directory */
export function expandHome(p: string): string {
  return p.replace(/^~/, process.env.HOME ?? '~');
}

export interface LatticeConfig {
  roots: string[];
  canonicalPath: string;
  maxDepth: number;
  ignoreDirs: string[];
  scanGlobal: boolean;
  installMode: InstallMode;
  hiddenRepos: string[];
}

export const DEFAULT_CONFIG: LatticeConfig = {
  roots: [],
  canonicalPath: '~/.assets',
  maxDepth: 4,
  ignoreDirs: [
    'node_modules', '.git', 'dist', 'build', 'vendor',
    '.next', '.nuxt', 'coverage', '.dart_tool', '.pub-cache',
  ],
  scanGlobal: true,
  installMode: 'copy',
  hiddenRepos: [],
};
