import type { LatticeConfig } from '../../services/config';
import { Scanner } from '../../services/scanner';
import { buildAssetGroups } from '../../services/sync-detector';
import { ContextStore } from '../../services/context-store';
import { LatticeGit } from '../../services/lattice-git';
import { getLatticeDir } from '../cli-config';
import * as output from '../output';

export async function statusCommand(config: LatticeConfig): Promise<void> {
  const scanner = new Scanner(config);
  const repos = await scanner.scan();
  const allAssets = repos.flatMap(r => r.assets);
  const groups = buildAssetGroups(allAssets);

  const latticeDir = getLatticeDir(config.canonicalPaths[0]);
  const store = new ContextStore(latticeDir);
  await store.load();
  store.buildFromScan(repos, config.canonicalPaths[0]);
  const changed = await store.save();

  if (changed) {
    const git = new LatticeGit(latticeDir);
    await git.ensureRepo();
    await git.commit('status: checked sync state');
  }

  const synced = groups.filter(g => g.syncStatus === 'synced');
  const diverged = groups.filter(g => g.syncStatus === 'diverged');

  output.heading('Sync Status');

  if (diverged.length > 0) {
    output.warn(`${diverged.length} diverged asset(s):`);
    const rows = diverged.map(g => [
      g.name,
      g.type,
      String(g.instances.length),
      output.badge('diverged', 'yellow'),
    ]);
    output.table(rows, ['Name', 'Type', 'Copies', 'Status']);
  }

  if (synced.length > 0) {
    console.log();
    output.success(`${synced.length} synced asset(s)`);
  }

  const githubAssets = store.getGitHubAssets();
  if (githubAssets.length > 0) {
    output.heading('GitHub Sources');
    const rows = githubAssets.map(a => [
      a.name,
      a.type,
      a.source?.url ?? '',
      a.source?.ref ?? '',
    ]);
    output.table(rows, ['Name', 'Type', 'Source', 'Ref']);
  }
}
