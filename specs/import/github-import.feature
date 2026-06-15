Feature: GitHub import
  As a developer adopting community configurations
  I want to import assets from GitHub repositories
  So that I can install shared skills and commands into my projects

  Scenario: Discovering assets in a cloned repo's .claude directory
    Given a cloned GitHub repo at "/tmp/clones/community-skills"
    And the repo contains ".claude/skills/find-docs" with a "SKILL.md"
    And the repo contains ".claude/commands/summarize.md"
    When Lattice discovers assets in the cloned repo
    Then it finds the "find-docs" skill and the "summarize" command

  Scenario: Discovering assets in a repo that is itself a context folder
    Given a cloned GitHub repo at "/tmp/clones/shared-skills"
    And the repo root contains "skills/review" with a "SKILL.md"
    And the repo does not have a ".claude/" directory
    When Lattice discovers assets in the cloned repo
    Then it finds the "review" skill from the root-level "skills/" directory

  Scenario: Scoped discovery via a subpath targets a specific skill
    Given a cloned repo with "skills/find-docs/SKILL.md" at the root
    And the user provided the subpath "skills/find-docs"
    When Lattice discovers assets using the subpath
    Then only the "find-docs" skill is returned

  Scenario: Installing discovered assets into target repos
    Given two discovered assets "audit" and "deploy" from a GitHub clone
    And the target repos are "acme-api" and "acme-web"
    When Lattice installs the discovered assets
    Then each asset is installed into each target repo
    And the total success count is 4

  Scenario: No assets found in a cloned repository
    Given a cloned GitHub repo that contains no ".claude/" directory
    And the repo root contains no asset-type directories
    When Lattice discovers assets in the cloned repo
    Then the discovered assets list is empty
