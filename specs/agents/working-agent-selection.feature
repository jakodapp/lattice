Feature: Working agent selection
  As a developer using Lattice across different AI coding tools
  I want Lattice to remember which agent my actions target
  So that copies, installs, and new repos land in that tool's config conventions

  Scenario Outline: The default working agent matches the host editor
    Given the user has not chosen a working agent
    And Lattice is running inside "<editor>"
    When Lattice determines the working agent
    Then the working agent is "<agent>"

    Examples:
      | editor             | agent  |
      | Cursor             | Cursor |
      | Antigravity        | Gemini |
      | Visual Studio Code | Claude |

  Scenario: A chosen working agent overrides the host default
    Given Lattice is running inside "Visual Studio Code"
    And the user selects "Gemini" as the working agent
    When Lattice determines the working agent
    Then the working agent is "Gemini"

  Scenario: The chosen working agent persists across sessions
    Given the user selects "Codex" as the working agent
    When the user reopens Lattice
    Then the working agent is still "Codex"

  Scenario: A stored working agent that is no longer offered reverts to the host default
    Given the user previously chose "Windsurf" as the working agent
    And "Windsurf" is no longer an offered agent
    And Lattice is running inside "Visual Studio Code"
    When Lattice determines the working agent
    Then the working agent is "Claude"

  Scenario: An unrecognized working agent is rejected
    Given the user has chosen "Claude" as the working agent
    When Lattice receives a request to select an unknown agent "nonexistent"
    Then the working agent remains "Claude"
    And no new choice is persisted

  Scenario: The universal ".agents" convention cannot be chosen as a working agent
    Given the user has chosen "Claude" as the working agent
    When Lattice receives a request to select the ".agents" universal convention
    Then the working agent remains "Claude"
    And no new choice is persisted
