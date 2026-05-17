/**
 * Extract a meaningful description from raw file content.
 * Pure function — no I/O, no vscode dependency, testable independently.
 *
 * Priority: 1) YAML frontmatter `description:` field
 *           2) Blockquote `> text` after heading
 *           3) First non-empty paragraph
 */
export function extractPreview(raw: string): string {
  // 1. Try YAML frontmatter `description:` field
  if (raw.startsWith('---')) {
    const end = raw.indexOf('---', 3);
    if (end !== -1) {
      const frontmatter = raw.slice(3, end);

      // Try YAML folded scalar: description: >\n  indented lines
      const foldedMatch = frontmatter.match(/^description:\s*>\s*\n((?:\s+.+\n?)+)/m);
      if (foldedMatch) {
        const desc = foldedMatch[1].replace(/\n\s*/g, ' ').trim();
        if (desc.length > 10) return desc.slice(0, 250).trim();
      }

      // Try single-line: description: "text" or description: text
      const inlineMatch = frontmatter.match(/^description:\s*"?\s*(.+?)(?:"\s*$|\n)/m);
      if (inlineMatch) {
        const desc = inlineMatch[1].trim().replace(/"\s*$/, '');
        if (desc.length > 10) return desc.slice(0, 250).trim();
      }
    }
  }

  // Strip frontmatter for further parsing
  let text = raw;
  if (text.startsWith('---')) {
    const end = text.indexOf('---', 3);
    if (end !== -1) { text = text.slice(end + 3).trimStart(); }
  }

  // Strip markdown heading
  text = text.replace(/^#+\s+[^\n]*\n+/, '');

  // 2. Try blockquote (> description)
  const quoteMatch = text.match(/^>\s*(.+?)(?:\n(?!>)|$)/s);
  if (quoteMatch) {
    const desc = quoteMatch[1].replace(/\n>\s*/g, ' ').trim();
    if (desc.length > 10) return desc.slice(0, 250).trim();
  }

  // 3. First non-empty paragraph (skip code fences)
  const lines = text.split('\n');
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
    if (trimmed.length > 10) return trimmed.slice(0, 250).trim();
  }

  return text.slice(0, 200).trim();
}
