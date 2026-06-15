Feature: File watching
  As a developer editing configurations in my IDE
  I want Lattice to detect changes in .claude/ directories
  So that the dashboard stays current without manual refresh

  Scenario: A new asset file triggers a debounced refresh
    Given Lattice is watching the ".claude/" directory for "acme-api"
    When the user creates ".claude/commands/new-deploy.md" in "acme-api"
    Then Lattice triggers a refresh after a 2-second debounce

  Scenario: Rapid consecutive changes produce a single refresh
    Given Lattice is watching the ".claude/" directory for "acme-api"
    When three files are created within 500 milliseconds
    Then Lattice triggers exactly one refresh after the debounce period

  Scenario: Changes in global internal directories are ignored
    Given Lattice is watching "~/.claude" as a global scope
    When a file changes in "~/.claude/projects/"
    Then no refresh is triggered

  Scenario: Changes in canonical internal directories are ignored
    Given Lattice is watching "~/.assets" as a canonical scope
    When a file changes in "~/.assets/.lattice/"
    Then no refresh is triggered

  Scenario: Watchers for removed repos are cleaned up
    Given Lattice is watching "acme-api" and "acme-web"
    When "acme-web" is no longer in the scan results
    Then the watcher for "acme-web" is disposed
    And the watcher for "acme-api" remains active
