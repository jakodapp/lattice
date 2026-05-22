import type { LatticeConfig } from '../../services/config';
import { Scanner } from '../../services/scanner';
import { moveAssetToRepo } from '../../services/asset-operations';
import { ContextStore } from '../../services/context-store';
import { LatticeGit } from '../../services/lattice-git';
import { getLatticeDir } from '../cli-config';
import * as output from '../output';

export async function moveCommand(config: LatticeConfig, args: string[]): Promise<void> {
  const assetName = args[0];
  const toIdx = args.indexOf('--to');
  const targetName = toIdx >= 0 ? args[toIdx + 1] : undefined;

  if (!assetName || !targetName) {
    output.error('Usage: lattice move <asset> --to <repo>');
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

  const targetRepo = repos.find(r => r.name.toLowerCase().includes(targetName.toLowerCase()));
  if (!targetRepo) {
    output.error(`No repo matching "${targetName}"`);
    process.exit(1);
  }

  const result = await moveAssetToRepo(asset, targetRepo, {
    canonicalBase: config.canonicalPaths,
  });

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
  await git.commit(`move: ${assetName} → ${targetName}`);
}
