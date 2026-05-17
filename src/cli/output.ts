const isTTY = process.stdout.isTTY ?? false;

const colors = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  red: isTTY ? '\x1b[31m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
};

export function success(msg: string): void {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${colors.red}✗${colors.reset} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${colors.yellow}!${colors.reset} ${msg}`);
}

export function info(msg: string): void {
  console.log(`${colors.dim}${msg}${colors.reset}`);
}

export function heading(msg: string): void {
  console.log(`\n${colors.bold}${msg}${colors.reset}`);
}

export function table(rows: string[][], headers?: string[]): void {
  const allRows = headers ? [headers, ...rows] : rows;
  const widths = allRows[0].map((_, col) =>
    Math.max(...allRows.map(row => (row[col] ?? '').length)),
  );

  if (headers) {
    const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
    console.log(`${colors.bold}${headerLine}${colors.reset}`);
    console.log(widths.map(w => '─'.repeat(w)).join('──'));
  }

  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  '));
  }
}

export function badge(label: string, color: keyof typeof colors): string {
  return `${colors[color]}${label}${colors.reset}`;
}
