Feature: Configuration
  As a user setting up Lattice for the first time
  I want to configure scan roots, canonical paths, and global paths
  So that Lattice knows where to discover my repos and shared assets

  Scenario: Scan roots determine which directories are traversed
    Given the user configures scan roots as "~/Projects" and "~/Work"
    When Lattice scans for repositories
    Then both "~/Projects" and "~/Work" are traversed for repos

  Scenario: Canonical paths default to the shared asset roots
    Given the user has not configured any canonical paths
    When Lattice resolves its configuration
    Then "~/.assets" and "~/.agents" are used as the canonical asset roots

  Scenario: Global paths default to the per-tool home directories
    Given the user has not configured any global paths
    When Lattice resolves its configuration
    Then "~/.claude", "~/.cursor", "~/.github", "~/.codex", and "~/.gemini" are used as global agent directories

  Scenario: Home directory tilde is expanded to the absolute path
    Given a path "~/.assets" is configured
    When Lattice resolves the path
    Then "~" is replaced with the user's home directory

  Scenario: Ignored directories are skipped during scanning
    Given "node_modules" and ".git" are in the ignore list
    When Lattice scans "~/Projects/acme-api"
    Then the "node_modules" and ".git" subdirectories are not traversed

  Scenario: Adding a new scan root triggers a rescan
    Given Lattice has one scan root "~/Projects"
    When the user adds "~/Work" as a new scan root
    Then Lattice rescans and includes repos from both roots

  Scenario: Hiding a repo removes it from the dashboard view only
    Given "acme-legacy" was discovered by a scan
    When the user hides "acme-legacy" from the dashboard
    Then "acme-legacy" no longer appears among the dashboard's visible repos
    But "acme-legacy" remains on disk and is still discovered by scans

  Scenario: Unhiding a repo restores it to the dashboard
    Given the user has hidden "acme-legacy" from the dashboard
    When the user unhides "acme-legacy"
    Then "acme-legacy" reappears among the dashboard's visible repos
