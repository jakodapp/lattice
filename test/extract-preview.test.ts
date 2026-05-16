import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { extractPreview } from '../src/services/preview-extractor';

describe('extractPreview', () => {
  it('extracts description from YAML frontmatter (quoted)', () => {
    const raw = `---
name: generate-docs
description: "Analyze the current project and generate structured technical documentation."
---

# Generate Docs
`;
    assert.equal(extractPreview(raw), 'Analyze the current project and generate structured technical documentation.');
  });

  it('extracts description from YAML frontmatter (unquoted)', () => {
    const raw = `---
name: admin-table-page
description: Scaffold a complete table-based page for the admin app with filters and pagination.
---

# Admin Table Page
`;
    assert.equal(extractPreview(raw), 'Scaffold a complete table-based page for the admin app with filters and pagination.');
  });

  it('extracts description from YAML frontmatter (multi-line >)', () => {
    const raw = `---
name: audit
description: >
  Audit code against universal engineering standards.
  Trigger when the user asks to audit or grade code quality.
---

# Code Auditor
`;
    assert.equal(extractPreview(raw), 'Audit code against universal engineering standards. Trigger when the user asks to audit or grade code quality.');
  });

  it('extracts blockquote after heading when no frontmatter description', () => {
    const raw = `# Ask - Interactive Questions

> Asks questions to fill missing information in your profile files.

## Usage
`;
    assert.equal(extractPreview(raw), 'Asks questions to fill missing information in your profile files.');
  });

  it('extracts first paragraph when no frontmatter or blockquote', () => {
    const raw = `# My Skill

This skill does something really useful for developers working on large codebases.

## Details
`;
    assert.equal(extractPreview(raw), 'This skill does something really useful for developers working on large codebases.');
  });

  it('extracts first paragraph from plain text (no heading)', () => {
    const raw = `This is a simple rule about keeping code clean and maintainable.

More details follow here.
`;
    assert.equal(extractPreview(raw), 'This is a simple rule about keeping code clean and maintainable.');
  });

  it('skips short descriptions and falls through', () => {
    const raw = `---
name: test
description: "short"
---

# Test

This is the actual useful description of the test command.
`;
    // "short" is < 10 chars, so it falls through to the paragraph
    assert.equal(extractPreview(raw), 'This is the actual useful description of the test command.');
  });

  it('truncates long descriptions to 250 chars', () => {
    const desc = 'A'.repeat(300);
    const raw = `---
name: long
description: "${desc}"
---
`;
    assert.equal(extractPreview(raw).length, 250);
  });

  it('handles frontmatter with long tools field before description', () => {
    const tools = 'tool1, tool2, tool3, tool4, tool5'.repeat(20);
    const raw = `---
name: design-review
description: Use this agent when you need to conduct a comprehensive design review on PRs.
tools: ${tools}
model: sonnet
---

# Design Reviewer
`;
    assert.equal(extractPreview(raw), 'Use this agent when you need to conduct a comprehensive design review on PRs.');
  });

  it('returns empty string for empty input', () => {
    assert.equal(extractPreview(''), '');
  });

  it('skips code fences and headings to find description', () => {
    const raw = `# Title

---

\`\`\`bash
npm install
\`\`\`

The actual description is here after the code block.
`;
    assert.equal(extractPreview(raw), 'The actual description is here after the code block.');
  });
});
