Feature: Dashboard communication
  As a user interacting with the Lattice dashboard
  I want my actions to be relayed between the webview and extension
  So that asset operations execute correctly and the UI stays updated

  Scenario: The dashboard receives repo data on initialization
    Given the extension has scanned 3 repos with a total of 12 assets
    When the dashboard webview initializes
    Then it receives an "init" message with all 3 serialized repos
    And each asset includes a content preview

  Scenario: Requesting a repo detail sends file groups and CLAUDE.md entries
    Given the repo "acme-api" has skills, commands, rules, and a CLAUDE.md
    When the user opens the detail panel for "acme-api"
    Then the webview receives a "detail" message
    And the message includes file groups for each asset category
    And the CLAUDE.md files are listed separately

  Scenario: File paths outside known repos are rejected
    Given the dashboard receives an "open-file" request for "/etc/passwd"
    When the extension validates the path
    Then the request is rejected with a "path outside known repositories" error

  Scenario: Diverged assets are identified by majority hash comparison
    Given a "deploy" command exists in 3 repos
    And 2 repos share hash "a1b2c3d4" while 1 repo has hash "e5f6a7b8"
    When the dashboard computes diverged paths
    Then only the repo with hash "e5f6a7b8" is in the diverged set

  Scenario: Context files are identified as non-copyable
    Given an asset with type "settings" at ".claude/settings.json"
    When the dashboard checks if the asset is a context file
    Then the asset is identified as a context file
    And copy and install actions are not available for it

  Scenario Outline: Adding a new repo creates the working agent's config dir
    Given the working agent is "<agent>"
    And a git repository exists at "~/Projects/<repo>"
    And "<repo>" does not have a "<config-dir>" folder
    When the user adds "<repo>" as a new repo via the dashboard
    Then a "<config-dir>/" folder is created in "<repo>"
    And no asset subdirectories are created until an asset is written

    Examples:
      | agent  | repo        | config-dir |
      | Claude | new-service | .claude    |
      | Cursor | ml-pipeline | .cursor    |

  Scenario: Forgetting a repo with assets prompts for review
    Given "acme-legacy" has 5 assets inside its ".claude/" directory
    When the user attempts to forget "acme-legacy"
    Then a warning indicates the repo has 5 assets
    And the user is offered to open the project for review before removing

  Scenario: Asset lookup resolves a SKILL.md path to its skill directory
    Given a skill "audit" is registered at ".claude/skills/audit"
    When the webview references the asset by its SKILL.md path ".claude/skills/audit/SKILL.md"
    Then the extension resolves it to the "audit" skill

  Scenario: Detail panel lists only valid skills, skipping loose files
    Given repo "acme-api" has ".claude/skills/audit/SKILL.md"
    And ".claude/skills/" also contains a loose file "notes.md"
    When the user opens the detail panel for "acme-api"
    Then the skills group includes "audit"
    And "notes.md" does not appear in the skills group

  Scenario: Open detail panel refreshes when repo data updates
    Given the detail panel is open for "acme-api"
    When the extension sends a "refresh" message with updated repo data
    Then the detail panel re-requests current data for "acme-api"

  Scenario: Asset details offer installing the asset into other repos
    Given the user is viewing the details of the skill "audit" from "acme-api"
    When the asset detail view renders its actions
    Then an "Install to Repo" action appears alongside "Open in Editor"

  Scenario: Installing from the asset details copies the asset into the chosen repos
    Given the user is viewing the details of the skill "audit" from "acme-api"
    When the user chooses "Install to Repo" and selects "acme-web" and "acme-cli"
    Then "audit" is installed into "acme-web" and "acme-cli"
    And the dashboard refreshes to show "audit" in both repos

  Scenario: Context files offer no install action in their details
    Given the user is viewing the details of "settings.json" from "acme-api"
    When the asset detail view renders its actions
    Then no "Install to Repo" action is offered
