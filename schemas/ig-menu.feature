Feature: Reading a SUSHI menu into groups, joining menu links, and the menu schema

  @test:schemas/ig-menu.test.ts::nestedMapBecomesGroups
  Scenario: a nested map becomes a group with its children, in the config's order
    Given a menu with the groups Home and Indices, each a map of pages
    When it is read into groups
    Then the group labels are "Home" then "Indices"
    And Home's items are Summary then Dependencies with their hrefs

  @test:schemas/ig-menu.test.ts::preservesConfigOrder
  Scenario: order is preserved, not alphabetised
    Given a menu with Zeta before Alpha
    Then the group labels are "Zeta" then "Alpha"

  @test:schemas/ig-menu.test.ts::bareStringIsTopLevelPage
  Scenario: a bare string is a top-level PAGE — href set, `items` empty rather than absent
    Given a menu entry Home that is the string "index.html"
    Then it becomes a group with href "index.html" and empty items

  @test:schemas/ig-menu.test.ts::keepsUnrecognisedEntry
  Scenario: an unrecognised entry is kept, not dropped
    Given a menu entry Odd whose value is 42
    Then it becomes a group labelled Odd with empty items

  @test:schemas/ig-menu.test.ts::nonObjectMenuIsEmpty
  Scenario: an absent or non-object menu is an empty list, not a crash
    Then an undefined, null or array menu gives an empty list

  @test:schemas/ig-menu.test.ts::joinsRelativeHref
  Scenario: joins a relative href to the canonical base
    Given a menu whose canonical is the IPS IG
    Then the href "ips-overview.html" joins to "http://hl7.org/fhir/uv/ips/ips-overview.html"

  @test:schemas/ig-menu.test.ts::doesNotDoubleSlash
  Scenario: does not double a slash, from either side
    Given a canonical ending in "/" and an href starting with "/"
    Then the join is "http://x.org/ig/a.html"

  @test:schemas/ig-menu.test.ts::leavesAbsoluteHrefAlone
  Scenario: leaves an absolute href alone
    Then an absolute href to elsewhere.org is returned unchanged

  @test:schemas/ig-menu.test.ts::completeMenuParses
  Scenario: a complete menu parses
    Given a complete menu with provenance
    Then the schema accepts it
    And it counts 1 menu item

  @test:schemas/ig-menu.test.ts::refusesMissingRef
  Scenario: a missing `ref` is refused
    Given the complete menu with its source ref removed
    Then the schema refuses it

  @test:schemas/ig-menu.test.ts::refusesNonUrlOf
  Scenario: a non-URL `of` is refused
    Given the complete menu with a source "of" of "somewhere"
    Then the schema refuses it

  @test:schemas/ig-menu.test.ts::emptyItemsLegalMissingItemsNot
  Scenario: a group with an empty `items` is legal; one with no `items` key is not
    Then a group with empty items is accepted
    And a group with no items key is refused
