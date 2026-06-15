Feature: Content hashing
  As a developer comparing asset versions across repos
  I want Lattice to produce deterministic SHA-256 hashes
  So that identical content is recognized regardless of location or metadata

  Scenario: Identical files produce the same hash
    Given a file "~/.claude/rules/no-any.md" with content "Avoid using any types in TypeScript"
    And a file "~/acme-api/.claude/rules/no-any.md" with the same content
    When Lattice hashes both files
    Then both files produce the same SHA-256 hash

  Scenario: Files with different content produce different hashes
    Given a file in "acme-api" with content "Use strict mode"
    And a file in "acme-web" with content "Use strict mode — no exceptions"
    When Lattice hashes both files
    Then the two files produce different SHA-256 hashes

  Scenario: Directory hash is computed from sorted file contents
    Given a skill directory "audit" containing "SKILL.md" and "helpers.js"
    When Lattice hashes the directory
    Then the hash is derived from the sorted relative paths and their individual hashes
    And reordering the files on disk does not change the directory hash

  Scenario: Identical skill directories in different repos produce the same hash
    Given a skill "audit" in "acme-api" with files "SKILL.md" and "helpers.js"
    And a skill "audit" in "acme-web" with identical file contents
    When Lattice hashes both directories
    Then both directories produce the same SHA-256 hash
