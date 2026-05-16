import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/** SHA-256 hash of a single file's contents */
export async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * SHA-256 hash of a directory's contents.
 * Sorts files by relative path, concatenates "relativePath:hash" for each,
 * then hashes the result. This ensures identical directories produce the same hash
 * regardless of filesystem metadata or traversal order.
 */
export async function hashDirectory(dirPath: string): Promise<string> {
  const entries = await collectFiles(dirPath);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const combined = entries.map(e => `${e.relativePath}:${e.hash}`).join('\n');
  return crypto.createHash('sha256').update(combined).digest('hex');
}

interface FileEntry {
  relativePath: string;
  hash: string;
}

async function collectFiles(dirPath: string, basePath?: string): Promise<FileEntry[]> {
  const base = basePath ?? dirPath;
  const entries: FileEntry[] = [];
  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      const nested = await collectFiles(fullPath, base);
      entries.push(...nested);
    } else if (item.isFile()) {
      const relativePath = path.relative(base, fullPath);
      const hash = await hashFile(fullPath);
      entries.push({ relativePath, hash });
    }
  }

  return entries;
}
