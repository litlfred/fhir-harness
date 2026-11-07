Feature: An IG's identity and the publication status it states

  @test:schemas/ig-identity.test.ts::statesStatusForNamedIg
  Scenario: states the status for the IG the identity names
    Given the identity of "example.ig.one" with status draft
    Then the status for "example.ig.one" is "draft"

  @test:schemas/ig-identity.test.ts::refusesOtherIgIdentity
  Scenario: refuses another IG's identity — a mis-filed copy paints no watermark
    Given the identity of "example.ig.one"
    Then the status for "example.ig.two" is undefined

  @test:schemas/ig-identity.test.ts::noIdentityOrPackageStatesNothing
  Scenario: no identity, or no package to compare, states nothing
    Then with no identity the status is undefined
    And with no package to compare the status is undefined

  @test:schemas/ig-identity.test.ts::ownIdentityValidates
  Scenario: an IG's own identity validates and names its own package
    Given an instance whose artifact index holds its IG identity
    When the identity is read
    Then it is defined, validates against the schema and names the IG's own package id

  @test:schemas/ig-identity.test.ts::noIdentityStatesNoStatus
  Scenario: an IG with none states no status (the third state)
    Given an instance whose artifact index has no identity
    Then reading its identity gives undefined
