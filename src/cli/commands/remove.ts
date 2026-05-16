import type { LatticeConfig } from '../../services/config';
import { getErrorMessage } from '../../constants';
import { Scanner } from '../../services/scanner';
import { deleteAsset } from '../../services/file-ops';
import { deleteCanonicalAsset, findAffectedSymlinks } from '../../services/asset-operations';
import { ContextStore } from '../../services/context-store';
import { LatticeGit } from '../../services/lattice-git';
import { getLatticeDir } from '../cli-config';
import * as output from '../output';

export async function removeCommand(config: LatticeConfig, args: string[]): Promise<void> {
  const repoName = args[0];
  const assetName = args[1];

  if (!repoName) {
    output.error('Usage: lattice remove <repo> [asset]');
    process.exit(1);
  }

  const scanner = new Scanner(config);
  const repos = await scanner.scan();
  const repo = repos.find(r => r.name.toLowerCase().includes(repoName.toLowerCase()));

  if (!repo) {
    output.error(`No repo matching "${repoName}"`);
    process.exit(1);
  }

  if (assetName) {
    // Remove specific asset from repo
    const asset = repo.assets.find(a => a.name === assetName);
    if (!asset) {
      output.error(`Asset "${assetName}" not found in ${repo.name}`);
      process.exit(1);
    }

    if (repo.isCanonical) {
      const affected = findAffectedSymlinks(asset, repos);
      if (affected.length > 0) {
        output.warn(`This will also remove symlinks from: ${affected.join(', ')}`);
      }
      const result = await deleteCanonicalAsset(asset, repos);
      if (result.ok) { output.success(result.message); } else { output.error(result.message); }
    } else {
      await deleteAsset(asset);
      output.success(`Removed "${assetName}" from ${repo.name}`);
    }
  } else {
    // Remove all assets from repo
    output.warn(`Removing all ${repo.assets.length} assets from ${repo.name}...`);
    for (const asset of repo.assets) {
      try {
        await deleteAsset(asset);
      } catch (err) { console.debug(`[LCM] Failed to delete ${asset.name}:`, getErrorMessage(err)); }
    }
    output.success(`Removed ${repo.assets.length} assets from ${repo.name}`);
  }

  const latticeDir = getLatticeDir(config.canonicalPath);
  const store = new ContextStore(latticeDir);
  await store.load();
  store.buildFromScan(await scanner.scan(), config.canonicalPath);
  await store.save();

  const git = new LatticeGit(latticeDir);
  await git.ensureRepo();
  const commitMsg = assetName
    ? `remove: ${assetName} from ${repoName}`
    : `remove: all assets from ${repoName}`;
  await git.commit(commitMsg);
}
