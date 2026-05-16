import type { LatticeConfig } from '../../services/config';
import { Scanner } from '../../services/scanner';
import { ContextStore } from '../../services/context-store';
import { LatticeGit } from '../../services/lattice-git';
import { getLatticeDir } from '../cli-config';
import * as output from '../output';

export async function scanCommand(config: LatticeConfig): Promise<void> {
  if (config.roots.length === 0) {
    output.error('No roots configured. Run: lattice scan --root <path>');
    output.info('Or create ~/.assets/.lattice/config.json with { "roots": ["/path/to/workspace"] }');
    process.exit(1);
  }

  output.info('Scanning repositories...');
  const scanner = new Scanner(config);
  const repos = await scanner.scan();

  const latticeDir = getLatticeDir(config.canonicalPath);
  const store = new ContextStore(latticeDir);
  await store.load();
  store.buildFromScan(repos, config.canonicalPath);
  const changed = await store.save();

  const git = new LatticeGit(latticeDir);
  await git.ensureRepo();
  if (changed) {
    const normalRepoCount = repos.filter(r => !r.isCanonical && !r.isGlobal).length;
    await git.commit(`scan: discovered ${normalRepoCount} repos, ${store.data.assets.length} assets`);
  }

  output.heading('Repositories');
  const normalRepos = repos.filter(r => !r.isCanonical && !r.isGlobal);
  const canonical = repos.find(r => r.isCanonical);
  const global = repos.find(r => r.isGlobal);

  if (canonical) {
    output.success(`${canonical.name} — ${canonical.assets.length} assets`);
  }
  if (global) {
    output.success(`${global.name} — ${global.assets.length} assets`);
  }

  const rows = normalRepos.map(r => [
    r.name,
    String(r.assets.length),
    r.agents?.join(', ') ?? '',
  ]);
  output.table(rows, ['Repository', 'Assets', 'Agents']);
  console.log();
  output.success(`Found ${repos.length} repos with ${repos.reduce((sum, r) => sum + r.assets.length, 0)} total assets`);
}
