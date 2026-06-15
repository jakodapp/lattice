Feature: Extension activation
  As a VSCode user with Lattice installed
  I want the extension to initialize automatically
  So that I see my asset overview as soon as I open the editor

  Scenario: Status bar shows local asset count after activation
    Given the user has configured scan roots
    And the current workspace "acme-api" has 7 visible assets
    When Lattice activates and completes the initial scan
    Then the status bar displays "7 assets"

  Scenario: Status bar prompts configuration when no roots are set
    Given the user has not configured any scan roots
    When Lattice activates
    Then the status bar displays "Lattice (0 assets)"
    And the tooltip suggests setting scan roots in settings

  Scenario: Configuration changes trigger an automatic rescan
    Given Lattice is active with scan root "~/Projects"
    When the user changes the "latticeContextManager" settings
    Then Lattice automatically performs a fresh scan

  Scenario: Concurrent refresh requests are coalesced
    Given a scan is already in progress
    When a second refresh is requested
    Then the second refresh runs after the first completes
    And only one scan runs at a time

  Scenario: Opening the dashboard initializes the webview panel
    Given Lattice is active with scanned repos
    When the user runs the "Open Dashboard" command
    Then a webview panel titled "Lattice Context Manager" opens
    And it receives the current repo data
