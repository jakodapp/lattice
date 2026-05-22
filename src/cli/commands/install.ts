import type { LatticeConfig } from '../../services/config';
import { Scanner } from '../../services/scanner';
import { installCanonicalToRepos } from '../../services/asset-operations';
import { ContextStore } from '../../services/context-store';
import { LatticeGit } from '../../services/lattice-git';
import { getLatticeDir } from '../cli-config';
import * as output from '../output';

export async function installCommand(config: LatticeConfig, args: string[]): Promise<void> {
  const assetName = args[0];
  const toIdx = args.indexOf('--to');
  const targetNames = toIdx >= 0 ? args.slice(toIdx + 1) : [];

  if (!assetName || targetNames.length === 0) {
    output.error('Usage: lattice install <asset> --to <repo1> [repo2 ...]');
    process.exit(1);
  }

  const scanner = new Scanner(config);
  const repos = await scanner.scan();
  const canonicalRepos = repos.filter(r => r.isCanonical);

  if (canonicalRepos.length === 0) {
    output.error('No canonical paths found. Check latticeContextManager.canonicalPaths setting.');
    process.exit(1);
  }

  let asset: import('../../types').Asset | undefined;
  for (const cr of canonicalRepos) {
    asset = cr.assets.find(a => a.name === assetName);
    if (asset) break;
  }
  if (!asset) {
    output.error(`Asset "${assetName}" not found in canonical paths`);
    process.exit(1);
  }

  const targetRepos = repos.filter(r => targetNames.some(n => r.name.toLowerCase().includes(n.toLowerCase())));
  if (targetRepos.length === 0) {
    output.error(`No repos matching: ${targetNames.join(', ')}`);
    process.exit(1);
  }

  const canonicalBases = canonicalRepos.map(r => r.path);
  const result = await installCanonicalToRepos(asset, targetRepos, canonicalBases);

  if (result.ok) {
    output.success(result.message);
  } else {
    output.error(result.message);
  }

  const latticeDir = getLatticeDir(config.canonicalPaths[0]);
  const store = new ContextStore(latticeDir);
  await store.load();
  store.buildFromScan(await scanner.scan(), config.canonicalPaths[0]);
  await store.save();

  const git = new LatticeGit(latticeDir);
  await git.ensureRepo();
  await git.commit(`install: ${assetName} → ${targetNames.join(', ')}`);
}
