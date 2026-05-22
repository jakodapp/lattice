import * as fs from 'fs/promises';

/** Check if a path (possibly a symlink) resolves to a directory */
export async function isSymlinkToDir(fullPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(fullPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Check if a dirent (or its symlink target) is a directory */
export async function isDirEntry(fullPath: string, entry: import('fs').Dirent): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  return isSymlinkToDir(fullPath);
}

/** Check if a dirent (or its symlink target) is a file */
export async function isFileEntry(fullPath: string, entry: import('fs').Dirent): Promise<boolean> {
  if (entry.isFile()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    const stat = await fs.stat(fullPath);
    return stat.isFile();
  } catch {
    return false;
  }
}
