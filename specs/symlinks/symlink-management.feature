Feature: Symlink management
  As a developer centralizing shared assets
  I want Lattice to install canonical assets as symlinks
  So that updates in the canonical location automatically propagate

  Scenario: Installing a canonical asset creates a relative symlink
    Given a skill "audit" exists at the canonical path "~/.assets/skills/audit"
    And "acme-api" does not have the "audit" skill
    When the user installs "audit" into "acme-api"
    Then "acme-api/.claude/skills/audit" is a symlink
    And the symlink points to "~/.assets/skills/audit" via a relative path

  Scenario: Installing a non-canonical asset copies the files
    Given a "deploy" command exists in "acme-api" at a non-canonical path
    When the user installs "deploy" into "acme-web"
    Then "acme-web/.claude/commands/deploy.md" is a regular file, not a symlink

  Scenario: Installing a canonical asset to a convert-format agent copies instead of symlinking
    Given a "lint" rule exists at the canonical path "~/.assets/rules/lint.md"
    And the working agent is "Cursor"
    When the user installs "lint" into "acme-api"
    Then "acme-api/.cursor/rules/lint.mdc" is a regular file, not a symlink
    And it contains the rule converted to Cursor's ".mdc" format

  Scenario: Re-installing an already-linked asset is a no-op
    Given "acme-api/.claude/skills/audit" already symlinks to "~/.assets/skills/audit"
    When the user installs "audit" into "acme-api" again
    Then the existing symlink is preserved unchanged

  Scenario: Symlink failure falls back to a file copy
    Given a skill "audit" exists at the canonical path "~/.assets/skills/audit"
    And symlink creation is not permitted for "acme-api"
    When the user installs "audit" into "acme-api"
    Then "audit" is copied as a regular file
    And the result indicates the symlink attempt failed

  Scenario: Converting synced copies to canonical symlinks
    Given a "lint" rule exists as regular files in "acme-api", "acme-web", and "acme-admin"
    And all three copies have the same content
    When the user converts "lint" to a canonical symlink using the "acme-api" version
    Then "~/.assets/rules/lint.md" contains the content from "acme-api"
    And all three repos have symlinks pointing to "~/.assets/rules/lint.md"

  Scenario: Converting diverged assets presents a version picker
    Given a "lint" rule exists in "acme-api" and "acme-web" with different content
    When the user initiates a convert-to-symlink for "lint"
    Then Lattice presents both versions for the user to choose from
