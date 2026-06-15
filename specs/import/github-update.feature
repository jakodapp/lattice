Feature: GitHub asset updates
  As a developer who imported shared assets from GitHub
  I want Lattice to detect and apply upstream changes
  So that my installed assets stay current with their source repository

  Background:
    Given the skill "code-review" was imported from "https://github.com/acme/shared-skills"
    And its recorded source has ref "main" and commit "3f2a91c7"

  Scenario: Checking for updates compares the recorded commit with the remote head
    Given the remote head of "acme/shared-skills" on "main" is commit "8d4e02b9"
    When Lattice checks "code-review" for updates
    Then "code-review" is reported as having an update available

  Scenario: An asset at the remote head is reported as up to date
    Given the remote head of "acme/shared-skills" on "main" is commit "3f2a91c7"
    When Lattice checks "code-review" for updates
    Then "code-review" is reported as up to date

  Scenario: A background check on dashboard load marks outdated imported assets
    Given the remote head of "acme/shared-skills" on "main" is commit "8d4e02b9"
    When the dashboard loads
    Then the "code-review" asset displays an update-available indicator

  Scenario: An asset without a recorded source offers no update action
    Given the command "deploy" was created locally and has no recorded source
    When the user views the "deploy" asset details
    Then no update action is offered for "deploy"

  Scenario: Updating an unmodified asset replaces its copied installations with the upstream version
    Given the remote head of "acme/shared-skills" on "main" is commit "8d4e02b9"
    And every installation of "code-review" still matches its recorded canonical hash
    When the user updates "code-review"
    Then the source repository is cloned to a temporary directory
    And every copied installation of "code-review" is replaced with the upstream content
    But any symlinked installation of "code-review" keeps following its canonical source
    And the temporary clone is removed

  Scenario: A successful update records the new source commit
    Given the remote head of "acme/shared-skills" on "main" is commit "8d4e02b9"
    When the user updates "code-review"
    Then the recorded source commit for "code-review" becomes "8d4e02b9"
    And the recorded fetch time is refreshed

  Scenario: Updating a locally modified asset asks the user to resolve the conflict
    Given the remote head of "acme/shared-skills" on "main" is commit "8d4e02b9"
    And the installation of "code-review" in "acme-api" no longer matches its recorded canonical hash
    When the user updates "code-review"
    Then a diff between the local version and the upstream version is shown
    And the user chooses between overwriting with upstream or keeping the local version

  Scenario: Keeping the local version preserves the files but still refreshes the source metadata
    Given the remote head of "acme/shared-skills" on "main" is commit "8d4e02b9"
    And the installation of "code-review" in "acme-api" no longer matches its recorded canonical hash
    And the user is resolving an update conflict for "code-review"
    When the user chooses to keep the local version
    Then the installation in "acme-api" is left unchanged
    And the recorded source commit for "code-review" advances to "8d4e02b9"

  Scenario: An update check failure does not block the dashboard
    Given the remote "acme/shared-skills" is unreachable
    When the dashboard loads
    Then the dashboard renders without update indicators
    And no error interrupts the user
