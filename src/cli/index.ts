import { loadCliConfig } from './cli-config';
import { getErrorMessage } from '../constants';
import { scanCommand } from './commands/scan';
import { statusCommand } from './commands/status';
import { listCommand } from './commands/list';
import { diffCommand } from './commands/diff';
import { copyCommand } from './commands/copy';
import { moveCommand } from './commands/move';
import { installCommand } from './commands/install';
import { syncCommand } from './commands/sync';
import { removeCommand } from './commands/remove';
import { agentsCommand } from './commands/agents';
import * as output from './output';

declare const __PKG_VERSION__: string;
const VERSION = __PKG_VERSION__;

const HELP = `
${output.badge('lattice', 'bold')} — Manage AI agent configurations across repositories

Usage: lattice <command> [options]

Commands:
  scan                          Discover repos and assets
  status                        Show sync status across repos
  list [--repo <name>]          List assets
  diff <asset>                  Diff asset versions across repos
  copy <asset> --to <repos...>  Copy asset to repos
  move <asset> --to <repo>      Move asset to repo
  install <asset> --to <repos>  Symlink canonical asset to repos
  sync [asset]                  Re-fetch GitHub-sourced assets
  remove <repo> [asset]         Remove repo or specific asset
  agents                        List detected agents per repo

Options:
  --help, -h     Show this help
  --version, -v  Show version

Config: ~/.assets/.lattice/config.json
Context: ~/.assets/.lattice/context.json
`;

const commands: Record<string, (config: Awaited<ReturnType<typeof loadCliConfig>>, args: string[]) => Promise<void>> = {
  scan: (c) => scanCommand(c),
  status: (c) => statusCommand(c),
  list: (c, a) => listCommand(c, a),
  diff: (c, a) => diffCommand(c, a),
  copy: (c, a) => copyCommand(c, a),
  move: (c, a) => moveCommand(c, a),
  install: (c, a) => installCommand(c, a),
  sync: (c, a) => syncCommand(c, a),
  remove: (c, a) => removeCommand(c, a),
  agents: (c) => agentsCommand(c),
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log(`lattice v${VERSION}`);
    return;
  }

  // Handle --root flag for scan bootstrapping
  const rootIdx = commandArgs.indexOf('--root');
  let config = await loadCliConfig();
  if (rootIdx >= 0 && commandArgs[rootIdx + 1]) {
    const root = commandArgs[rootIdx + 1];
    config = { ...config, roots: [...config.roots, root] };
    commandArgs.splice(rootIdx, 2);
  }

  const handler = commands[command];
  if (!handler) {
    output.error(`Unknown command: ${command}`);
    console.log(HELP);
    process.exit(1);
  }

  try {
    await handler(config, commandArgs);
  } catch (err) {
    output.error(getErrorMessage(err));
    process.exit(1);
  }
}

main();
