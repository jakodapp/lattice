Feature: Asset operations
  As a developer distributing configurations across repos
  I want to copy, move, and delete assets between repos
  So that I can maintain a consistent setup across projects

  Scenario: Copying a single-file asset writes into the working agent's config dir
    Given a "deploy" command exists in "acme-api" at ".claude/commands/deploy.md"
    And the working agent is "Claude"
    When the user copies "deploy" from "acme-api" to "acme-web"
    Then "acme-web/.claude/commands/deploy.md" contains the same content as the original

  Scenario: Copying a skill directory preserves all files
    Given a skill "audit" exists in "acme-api" with "SKILL.md" and "checklist.md"
    And the working agent is "Claude"
    When the user copies "audit" from "acme-api" to "acme-web"
    Then "acme-web/.claude/skills/audit/" contains both "SKILL.md" and "checklist.md"

  Scenario: Selecting a different working agent scopes the copy to that agent's config dir
    Given a "deploy" command exists in "acme-api"
    And the working agent is "Codex"
    When the user copies "deploy" from "acme-api" to "acme-web"
    Then "deploy" is written to "acme-web/.codex/prompts/deploy.md"

  Scenario: Copying to an agent that requires a different format converts the asset
    Given a "style" rule exists in "acme-api" at ".claude/rules/style.md"
    And the working agent is "Cursor"
    When the user copies "style" from "acme-api" to "acme-web"
    Then "style" is written to "acme-web/.cursor/rules/style.mdc"

  Scenario: Copying an asset type the working agent does not support reports an error
    Given a "style" rule exists in "acme-api"
    And the working agent is "Codex"
    When the user copies "style" from "acme-api" to "acme-web"
    Then the copy fails reporting that Codex does not support rule assets

  Scenario: Moving an asset removes it from the source repo
    Given a "format" rule exists in "acme-api"
    When the user moves "format" from "acme-api" to "acme-web"
    Then "format" exists in "acme-web"
    And "format" no longer exists in "acme-api"

  Scenario: Deleting a single-file asset removes it from disk
    Given a "legacy" command exists in "acme-api" at ".claude/commands/legacy.md"
    When the user deletes "legacy" from "acme-api"
    Then the file ".claude/commands/legacy.md" no longer exists in "acme-api"

  Scenario: Deleting a skill directory removes the entire folder
    Given a skill "old-lint" exists in "acme-api" as a directory
    When the user deletes "old-lint" from "acme-api"
    Then the "old-lint" directory and all its contents are removed

  Scenario: Batch copy reports partial failures
    Given a "deploy" command exists in "acme-api"
    And the target repos are "acme-web", "acme-admin", and "acme-docs"
    And "acme-docs" has a read-only ".claude/" directory
    When the user copies "deploy" to all three repos
    Then "deploy" is copied to "acme-web" and "acme-admin"
    And the result reports 2 successes and 1 failure

  Scenario: Pushing an asset distributes it only to repos that lack it
    Given a "strict-types" rule exists in "acme-api" and "acme-admin"
    And "acme-web" does not have a "strict-types" rule
    When the user pushes "strict-types" to all repos
    Then "strict-types" is copied to "acme-web"
    And "acme-api" and "acme-admin" are skipped
