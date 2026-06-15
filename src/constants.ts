// --- Context directories that identify a managed repo alongside .git ---
export const CONTEXT_DIRS = new Set([
  '.claude', '.github', '.cursor', '.agents', '.codex', '.gemini',
]);

// --- Asset types hidden from user-facing counts and views ---
export const HIDDEN_ASSET_TYPES = new Set(['settings', 'claude-md', 'mcp-config', 'instructions']);

// --- File names ---
export const SKILL_MD = 'SKILL.md';
export const CLAUDE_MD = 'CLAUDE.md';
export const AGENTS_MD = 'AGENTS.md';
export const GEMINI_MD = 'GEMINI.md';

// --- Legacy single-file instruction conventions detected at repo root ---
export const LEGACY_INSTRUCTION_FILES = ['.cursorrules'];
export const SETTINGS_JSON = 'settings.json';
export const SETTINGS_LOCAL_JSON = 'settings.local.json';
export const MCP_SERVERS_JSON = 'mcp_servers.json';
export const THUMBS_DB = 'Thumbs.db';

// --- Hash sentinel for assets whose content couldn't be read ---
export const UNREADABLE_HASH = 'unreadable';

/**
 * Find the majority hash from a list, ignoring unreadable entries.
 * Returns the strictly-highest-count hash, or null if tied or all unreadable.
 */
export function findMajorityHash(hashes: string[]): string | null {
  const counts = new Map<string, number>();
  for (const h of hashes) {
    if (h === UNREADABLE_HASH) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }

  let majority = '';
  let maxCount = 0;
  let tied = false;
  for (const [hash, count] of counts) {
    if (count > maxCount) {
      majority = hash;
      maxCount = count;
      tied = false;
    } else if (count === maxCount) {
      tied = true;
    }
  }

  return tied || maxCount === 0 ? null : majority;
}

// --- Display ---
export const HASH_DISPLAY_LENGTH = 8;
export const PREVIEW_LINE_LIMIT = 300;

/** Truncate a hash for display (first 8 chars) */
export function displayHash(hash: string): string {
  return hash.slice(0, HASH_DISPLAY_LENGTH);
}

/** Truncate file content to a preview (first 300 lines) */
export function truncatePreview(content: string): string {
  return content.split('\n').slice(0, PREVIEW_LINE_LIMIT).join('\n');
}

/** Extract a human-readable error message from an unknown caught value */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
