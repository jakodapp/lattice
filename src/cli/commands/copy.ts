import { expandHome } from '../../services/config';
import type { LatticeConfig } from '../../services/config';
import { Scanner } from '../../services/scanner';
import { copyAssetToRepos } from '../../services/asset-operations';
import { ContextStore } from '../../services/context-store';
import { LatticeGit } from '../../services/lattice-git';
import { getLatticeDir } from '../cli-config';
import * as output from '../output';

export async function copyCommand(config: LatticeConfig, args: string[]): Promise<void> {
  const assetName = args[0];
  const toIdx = args.indexOf('--to');
  const targetNames = toIdx >= 0 ? args.slice(toIdx + 1) : [];

  if (!assetName || targetNames.length === 0) {
    output.error('Usage: lattice copy <asset> --to <repo1> [repo2 ...]');
    process.exit(1);
  }

  const scanner = new Scanner(config);
  const repos = await scanner.scan();
  const allAssets = repos.flatMap(r => r.assets);
  const asset = allAssets.find(a => a.name === assetName);

  if (!asset) {
    output.error(`Asset "${assetName}" not found`);
    process.exit(1);
  }

  const targetRepos = repos.filter(r => targetNames.some(n => r.name.toLowerCase().includes(n.toLowerCase())));
  if (targetRepos.length === 0) {
    output.error(`No repos matching: ${targetNames.join(', ')}`);
    process.exit(1);
  }

  const expandedCanonical = expandHome(config.canonicalPath);
  const result = await copyAssetToRepos(asset, targetRepos, {
    mode: config.installMode,
    canonicalBase: expandedCanonical,
  });

  if (result.ok) {
    output.success(result.message);
  } else {
    output.error(result.message);
  }

  const latticeDir = getLatticeDir(config.canonicalPath);
  const store = new ContextStore(latticeDir);
  await store.load();
  store.buildFromScan(await scanner.scan(), config.canonicalPath);
  await store.save();

  const git = new LatticeGit(latticeDir);
  await git.ensureRepo();
  await git.commit(`copy: ${assetName} → ${targetNames.join(', ')}`);
}
