import { expandHome } from '../../services/config';
import type { LatticeConfig } from '../../services/config';
import { getErrorMessage } from '../../constants';
import { ContextStore } from '../../services/context-store';
import { LatticeGit } from '../../services/lattice-git';
import { shallowClone, cleanupClone, getHeadCommit } from '../../services/git-ops';
import { discoverAssets } from '../../services/github-import';
import { hashFile, hashDirectory } from '../../services/hasher';
import { getLatticeDir } from '../cli-config';
import * as output from '../output';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function syncCommand(config: LatticeConfig, args: string[]): Promise<void> {
  const assetName = args[0];
  const latticeDir = getLatticeDir(config.canonicalPath);
  const store = new ContextStore(latticeDir);
  await store.load();

  const githubAssets = store.getGitHubAssets();
  if (githubAssets.length === 0) {
    output.info('No GitHub-sourced assets to sync');
    return;
  }

  const toSync = assetName
    ? githubAssets.filter(a => a.name === assetName)
    : githubAssets;

  if (toSync.length === 0) {
    output.warn(`No GitHub-sourced asset named "${assetName}"`);
    return;
  }

  output.heading(`Syncing ${toSync.length} asset(s) from GitHub`);
  const expandedCanonical = expandHome(config.canonicalPath);
  const git = new LatticeGit(latticeDir);
  await git.ensureRepo();
  let updated = 0;

  for (const asset of toSync) {
    const source = asset.source!;
    output.info(`  ${asset.name} ← ${source.url}@${source.ref}`);

    let clonePath: string;
    try {
      const result = await shallowClone(source.url, source.ref);
      clonePath = result.localPath;
    } catch (err) {
      output.error(`  Failed to clone: ${getErrorMessage(err)}`);
      continue;
    }

    try {
      const discovered = await discoverAssets(clonePath);
      const match = discovered.find(d => d.name === asset.name && d.type === asset.type);
      if (!match) {
        output.warn(`  Asset "${asset.name}" not found in cloned repo`);
        continue;
      }

      const newHash = match.isDirectory
        ? await hashDirectory(match.sourcePath)
        : await hashFile(match.sourcePath);

      if (newHash === asset.canonicalHash) {
        output.success(`  ${asset.name} — already up to date`);
        continue;
      }

      // Update canonical version
      const canonicalTarget = path.join(expandedCanonical, asset.type === 'skill' ? 'skills' : `${asset.type}s`, asset.name);
      await fs.rm(canonicalTarget, { recursive: true, force: true });
      await fs.mkdir(path.dirname(canonicalTarget), { recursive: true });
      if (match.isDirectory) {
        await fs.cp(match.sourcePath, canonicalTarget, { recursive: true });
      } else {
        await fs.copyFile(match.sourcePath, canonicalTarget);
      }

      const commitHash = await getHeadCommit(clonePath).catch(() => 'unknown');
      const oldHash = asset.canonicalHash.slice(0, 7);
      const newShort = newHash.slice(0, 7);

      store.trackAsset({
        ...asset,
        canonicalHash: newHash,
        modifiedAt: new Date().toISOString(),
        source: { ...source, commitHash, fetchedAt: new Date().toISOString() },
      });

      output.success(`  ${asset.name} — updated (${oldHash} → ${newShort})`);
      updated++;
    } finally {
      await cleanupClone(clonePath);
    }
  }

  await store.save();
  if (updated > 0) {
    await git.commit(`sync: updated ${updated} asset(s) from GitHub`);
  }

  console.log();
  output.success(`Sync complete. ${updated} updated, ${toSync.length - updated} unchanged.`);
}
