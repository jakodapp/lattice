import type { LatticeConfig } from '../../services/config';
import { Scanner } from '../../services/scanner';
import { ASSET_TYPE_LABELS } from '../../types';
import * as output from '../output';

export async function listCommand(config: LatticeConfig, args: string[]): Promise<void> {
  const repoFlag = args.indexOf('--repo');
  const repoFilter = repoFlag >= 0 ? args[repoFlag + 1] : undefined;

  const scanner = new Scanner(config);
  const repos = await scanner.scan();
  const filtered = repoFilter
    ? repos.filter(r => r.name.toLowerCase().includes(repoFilter.toLowerCase()))
    : repos.filter(r => !r.isGlobal);

  if (filtered.length === 0) {
    output.warn(repoFilter ? `No repo matching "${repoFilter}"` : 'No repos found');
    return;
  }

  for (const repo of filtered) {
    output.heading(`${repo.name}${repo.isCanonical ? ' (Canonical)' : ''}`);
    if (repo.assets.length === 0) {
      output.info('  No assets');
      continue;
    }

    // Group by type
    const byType = new Map<string, typeof repo.assets>();
    for (const a of repo.assets) {
      const list = byType.get(a.type) ?? [];
      list.push(a);
      byType.set(a.type, list);
    }

    for (const [type, assets] of byType) {
      const label = ASSET_TYPE_LABELS[type as keyof typeof ASSET_TYPE_LABELS] ?? type;
      console.log(`  ${output.badge(label, 'cyan')} (${assets.length})`);
      for (const a of assets) {
        const symlink = a.isSymlink ? ' → symlink' : '';
        console.log(`    ${a.name}${symlink}`);
      }
    }
  }
}
