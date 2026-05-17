import type { LatticeConfig } from '../../services/config';
import { Scanner } from '../../services/scanner';
import * as output from '../output';

export async function agentsCommand(config: LatticeConfig): Promise<void> {
  const scanner = new Scanner(config);
  const repos = await scanner.scan();
  const normalRepos = repos.filter(r => !r.isCanonical && !r.isGlobal);

  output.heading('Agents Detected');

  if (normalRepos.length === 0) {
    output.warn('No repos found');
    return;
  }

  const rows = normalRepos
    .filter(r => r.agents && r.agents.length > 0)
    .map(r => [r.name, r.agents!.join(', ')]);

  if (rows.length === 0) {
    output.info('No agents detected in any repo');
    return;
  }

  output.table(rows, ['Repository', 'Agents']);
}
