Feature: The facts of an IG's page footer

  @test:scripts/ig-footer.test.ts::readsFromPackagePreferringIg
  Scenario: reads every value from the package, preferring the ImplementationGuide resource
    Given a package and its ImplementationGuide resource
    When the footer data is read
    Then it holds the publisher and url, package id, version, FHIR version and url, generated date, licence and licence url

  @test:scripts/ig-footer.test.ts::fallsBackToPackageThenIndex
  Scenario: falls back to package.json, then to the index
    Then with no ImplementationGuide the publisher url comes from package.json
    And with only the index, the package id, version, FHIR version and url, and the day of the build stamp come from it

  @test:scripts/ig-footer.test.ts::leavesOutUnsourced
  Scenario: leaves out what no source carries rather than writing undefined or a guess
    Then with no source the footer data is an empty object

  @test:scripts/ig-footer.test.ts::fhirReleaseOnlyKnown
  Scenario: names a FHIR release only for a version it knows
    Then 4.3.0 links the R4B specification
    And "6.0.0-ballot1" links none

  @test:scripts/ig-footer.test.ts::linksSpdxLicence
  Scenario: links an SPDX-shaped licence and nothing else
    Then "CC0-1.0" links its SPDX page
    And "see the IG" links nothing

  @test:scripts/ig-footer.test.ts::readsBuildStampForms
  Scenario: reads a build stamp in either form
    Then an ISO time and a compact stamp both give the day "2026-10-01"
    And "Oct 1" gives no day

  @test:scripts/ig-footer.test.ts::sushiFooterShapes
  Scenario: reads SUSHI's shapes: a publisher object, packageId defaulting to id, a copyright year
    Given a sushi-config with a publisher object, an id, a licence and a copyright year
    Then the footer data has the publisher and url, the id as package id, the version, FHIR version and url, licence and url, and the year
    And a plain-string publisher, a list of FHIR versions and a numeric year are read too
    And an empty config gives empty data

  @test:scripts/ig-footer.test.ts::linksRowOnlyHeld
  Scenario: keeps the Publisher's order and drops a target that is not there
    Given a site holding the TOC and the version history, and a licence url
    Then the links are Table of Contents, Version History and License, in that order
    And with nothing held and no licence there are no links
