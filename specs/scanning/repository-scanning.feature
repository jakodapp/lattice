Feature: Repository scanning
  As a developer managing configurations across multiple projects
  I want Lattice to discover repos and enumerate assets from every agent tool convention
  So that I have a unified view of all context configurations

  Scenario: Lattice discovers a repo with a context folder and git history
    Given a directory "~/Projects/acme-api" contains a ".git" folder
    And "~/Projects/acme-api" contains a ".claude" folder
    And "~/Projects" is configured as a scan root
    When Lattice scans the configured roots
    Then "acme-api" appears in the list of discovered repos

  Scenario: Lattice skips a directory without any context folder
    Given a directory "~/Projects/personal-notes" contains a ".git" folder
    And "~/Projects/personal-notes" contains no context folder of any agent tool
    And "~/Projects" is configured as a scan root
    When Lattice scans the configured roots
    Then "personal-notes" does not appear in the list of discovered repos

  Scenario: Lattice skips a context folder that has no git history
    Given a directory "~/Projects/scratch" contains a ".claude" folder
    And "~/Projects/scratch" does not contain a ".git" folder
    And "~/Projects" is configured as a scan root
    When Lattice scans the configured roots
    Then "scratch" does not appear in the list of discovered repos

  Scenario: Lattice discovers a repo that only has a non-Claude context folder
    Given a directory "~/Projects/ml-pipeline" contains a ".git" folder
    And "~/Projects/ml-pipeline" contains a ".codex" folder but no ".claude" folder
    And "~/Projects" is configured as a scan root
    When Lattice scans the configured roots
    Then "ml-pipeline" appears in the list of discovered repos

  Scenario: Lattice enumerates skills as directories containing a SKILL.md
    Given a repo "acme-api" has a ".claude/skills/audit" directory
    And ".claude/skills/audit" contains a "SKILL.md" file
    When Lattice enumerates assets for "acme-api"
    Then an asset named "audit" of type "skill" is discovered
    And the asset is marked as a directory

  Scenario: Lattice enumerates single-file assets by file extension
    Given a repo "acme-api" has a ".claude/commands/deploy.md" file
    When Lattice enumerates assets for "acme-api"
    Then an asset named "deploy" of type "command" is discovered
    And the asset is marked as a single file

  Scenario: Lattice detects symlinked assets and records the canonical path
    Given a repo "acme-api" has a ".claude/skills/audit" symlink
    And the symlink resolves to "~/.assets/skills/audit"
    When Lattice enumerates assets for "acme-api"
    Then the "audit" asset is marked as a symlink
    And the canonical path is recorded as "~/.assets/skills/audit"

  Scenario: Lattice respects the maximum scan depth
    Given "~/Projects" is configured as a scan root with max depth 2
    And "~/Projects/org/team/deep-repo" contains ".git" and ".claude" folders
    When Lattice scans the configured roots
    Then "deep-repo" does not appear because it exceeds the depth limit

  Scenario: Lattice scans global configuration directories
    Given "~/.claude" is configured as a global path
    And "~/.claude/skills/code-review" contains a "SKILL.md" file
    When Lattice scans global paths
    Then a global repo "~/.claude" appears with the "code-review" skill

  Scenario: Lattice scans canonical shared asset directories
    Given "~/.assets" is configured as a canonical path
    And "~/.assets/skills/lint-fix" contains a "SKILL.md" file
    When Lattice scans canonical paths
    Then a canonical repo "~/.assets (Canonical)" appears with the "lint-fix" skill

  Scenario: Lattice discovers git repos that lack a context folder
    Given "~/Projects/new-service" contains a ".git" folder
    And "~/Projects/new-service" does not contain any context folder
    When Lattice discovers uninitialized repos
    Then "new-service" appears in the uninitialized repos list

  Scenario: Lattice names repos relative to their scan root
    Given "~/Workplace" is configured as a scan root
    And "~/Workplace/jakoda/lattice" contains ".git" and ".claude" folders
    When Lattice scans the configured roots
    Then the repo is named "jakoda/lattice"

  Scenario: Lattice enumerates Cursor rules and commands as first-class assets
    Given a repo "acme-api" has a ".cursor/rules/code-style.mdc" file
    And "acme-api" has a ".cursor/commands/review.md" file
    When Lattice enumerates assets for "acme-api"
    Then an asset named "code-style" of type "rule" is discovered with tool "cursor"
    And an asset named "review" of type "command" is discovered with tool "cursor"

  Scenario: Lattice enumerates universal .agents assets
    Given a repo "acme-api" has ".agents/skills/review" containing a "SKILL.md" file
    And "acme-api" has a ".agents/workflows/deploy.md" file
    And "acme-api" has a ".agents/rules/security.md" file
    When Lattice enumerates assets for "acme-api"
    Then a "review" skill, a "deploy" workflow, and a "security" rule are discovered from ".agents"

  Scenario: Lattice enumerates Gemini assets from the .gemini folder
    Given a repo "acme-api" has a ".gemini/rules/style.md" file
    And "acme-api" has a ".gemini/workflows/release.md" file
    When Lattice enumerates assets for "acme-api"
    Then a "style" rule and a "release" workflow are discovered with tool "gemini"

  Scenario: Lattice enumerates Codex prompts as commands
    Given a repo "acme-api" has a ".codex/prompts/fix-tests.md" file
    When Lattice enumerates assets for "acme-api"
    Then an asset named "fix-tests" of type "command" is discovered with tool "codex"

  Scenario: Lattice detects root-level instruction files across conventions
    Given a repo "acme-api" has an "AGENTS.md" file at its root
    And "acme-api" has a legacy ".cursorrules" file at its root
    When Lattice enumerates assets for "acme-api"
    Then "AGENTS.md" and ".cursorrules" are discovered as "instructions" assets

  Scenario: Lattice scans tool-specific global directories with their own layout
    Given "~/.codex" is configured as a global path
    And "~/.codex/prompts/changelog.md" exists
    When Lattice scans global paths
    Then a global repo "~/.codex" appears with the "changelog" command
