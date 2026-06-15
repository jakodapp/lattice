Feature: Sync detection
  As a developer maintaining consistent configurations across repos
  I want Lattice to detect which assets are in sync and which have diverged
  So that I can identify and resolve inconsistencies

  Scenario: Assets with the same name and type are grouped together
    Given a "deploy" command exists in "acme-api" and "acme-web"
    When Lattice builds asset groups
    Then a single group named "deploy" of type "command" contains both instances

  Scenario: All instances sharing the same hash are marked synced
    Given a "no-any" rule exists in "acme-api", "acme-web", and "acme-admin"
    And all three instances have the same content hash
    When Lattice determines the group sync status
    Then the group is marked as "synced"

  Scenario: Instances with different hashes mark the group as diverged
    Given a "deploy" command exists in "acme-api" and "acme-web"
    And the two instances have different content hashes
    When Lattice determines the group sync status
    Then the group is marked as "diverged"

  Scenario: A single instance across all repos is marked unique
    Given a "migrate-db" command exists only in "acme-api"
    When Lattice determines the instance status
    Then the instance is marked as "unique"

  Scenario: The majority hash identifies the canonical version
    Given a "lint" rule exists in "acme-api", "acme-web", and "acme-admin"
    And "acme-api" and "acme-web" share hash "a1b2c3d4"
    And "acme-admin" has hash "e5f6a7b8"
    When Lattice determines instance statuses
    Then "acme-api" and "acme-web" are marked "synced"
    And "acme-admin" is marked "modified"

  Scenario: Tied hash counts mark all instances as modified
    Given a "format" rule exists in "acme-api" and "acme-web"
    And "acme-api" has hash "a1b2c3d4" and "acme-web" has hash "e5f6a7b8"
    When Lattice determines instance statuses
    Then both instances are marked "modified"

  Scenario: Unreadable assets are always marked modified
    Given a "protected" rule exists in "acme-api" and "acme-web"
    And the "acme-api" instance could not be read during hashing
    When Lattice determines instance statuses
    Then the "acme-api" instance is marked "modified"

  Scenario: A group whose every instance is unreadable is marked diverged
    Given a "protected" rule exists in "acme-api" and "acme-web"
    And neither instance could be read during hashing
    When Lattice determines the group sync status
    Then the group is marked as "diverged"
