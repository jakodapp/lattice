import type { LatticeConfig } from '../../services/config';
import { displayHash } from '../../constants';
import { Scanner } from '../../services/scanner';
import { buildAssetGroups } from '../../services/sync-detector';
import * as output from '../output';
import * as fs from 'fs/promises';

export async function diffCommand(config: LatticeConfig, args: string[]): Promise<void> {
  const assetName = args[0];

  if (!assetName) {
    output.error('Usage: lattice diff <asset>');
    process.exit(1);
  }

  const scanner = new Scanner(config);
  const repos = await scanner.scan();
  const allAssets = repos.flatMap(r => r.assets);
  const groups = buildAssetGroups(allAssets);
  const group = groups.find(g => g.name === assetName);

  if (!group) {
    output.error(`Asset "${assetName}" not found`);
    process.exit(1);
  }

  if (group.instances.length < 2) {
    output.info(`"${assetName}" exists in only 1 repo — nothing to diff`);
    return;
  }

  output.heading(`Diff: ${assetName} (${group.type})`);
  output.info(`${group.instances.length} instances, status: ${group.syncStatus}`);
  console.log();

  // Show hash comparison
  const rows = group.instances.map(i => [
    i.repoName,
    displayHash(i.hash),
    i.isSymlink ? 'symlink' : 'copy',
  ]);
  output.table(rows, ['Repo', 'Hash', 'Mode']);

  // If diverged and instances are files, show simple diff
  if (group.syncStatus === 'diverged') {
    const fileInstances = group.instances.filter(i => !i.isDirectory);
    if (fileInstances.length >= 2) {
      console.log();
      output.heading('Content Diff');
      const [a, b] = fileInstances;
      try {
        const contentA = await fs.readFile(a.path, 'utf-8');
        const contentB = await fs.readFile(b.path, 'utf-8');
        const linesA = contentA.split('\n');
        const linesB = contentB.split('\n');
        const maxLines = Math.max(linesA.length, linesB.length);

        output.info(`--- ${a.repoName}`);
        output.info(`+++ ${b.repoName}`);
        for (let i = 0; i < maxLines; i++) {
          if (linesA[i] !== linesB[i]) {
            if (linesA[i] !== undefined) console.log(output.badge(`- ${linesA[i]}`, 'red'));
            if (linesB[i] !== undefined) console.log(output.badge(`+ ${linesB[i]}`, 'green'));
          }
        }
      } catch {
        output.info('Could not read files for diff');
      }
    }
  }
}
