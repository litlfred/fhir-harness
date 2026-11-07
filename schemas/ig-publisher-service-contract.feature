Feature: The IG Publisher service contract: its role, actor, policy grant and capabilities

  @test:schemas/ig-publisher-service-contract.test.ts::roleSystemOnlyCarriesContract
  Scenario: played only by a system Actor, carrying ig-publisher-service-contract
    Then the role is played only by system actors
    And the role carries the skill "ig-publisher-service-contract"

  @test:schemas/ig-publisher-service-contract.test.ts::actorPlaysRoleWithCapabilities
  Scenario: the Actor named in the contract plays it, with both capabilities
    Then the actor is a system actor that plays "ig-publisher-service"
    And its capabilities include "ig-publisher" and "fhir-validator"

  @test:schemas/ig-publisher-service-contract.test.ts::actorDescriptionSaysBuildAndQa
  Scenario: the actor's own description says so
    Then the actor's description mentions "FHIR IG Publisher build and QA reporting"

  @test:schemas/ig-publisher-service-contract.test.ts::odrlGrantsQaReporting
  Scenario: ODRL grants it qa-reporting
    When the policy grants are read from the policies directory
    Then "ig-publisher-service" is granted "qa-reporting"

  @test:schemas/ig-publisher-service-contract.test.ts::publisherSatisfiesQaRequirement
  Scenario: the ig-publisher capability satisfies req:fhir-validation#ig-publisher-qa
    Then the ig-publisher capability satisfies "req:fhir-validation#ig-publisher-qa"

  @test:schemas/ig-publisher-service-contract.test.ts::qaStatementDemandsNoErrors
  Scenario: that statement demands no errors in qa.html, and depends on #sushi-compile
    Given the requirement statement "ig-publisher-qa"
    Then its text demands "no errors in qa.html"
    And it depends on "sushi-compile", which is also a statement

  @test:schemas/ig-publisher-service-contract.test.ts::validatorIsSeparateCapability
  Scenario: fhir-validator is its own capability, and does not claim the whole-IG statement
    Then the validator capability has the id "fhir-validator", different from the publisher's
    And it does not satisfy "req:fhir-validation#ig-publisher-qa"

  @test:schemas/ig-publisher-service-contract.test.ts::detectedByVersionCommand
  Scenario: each capability is detected by a command that asks the jar its version
    Then the publisher is detected by a command "java -jar <jar> --version"
    And the validator is detected by a command "java -jar <jar> -version"

  @test:schemas/ig-publisher-service-contract.test.ts::bothRequireJavaRuntime
  Scenario: each requires java-runtime, which is itself a declared capability
    Then the publisher and the validator each require exactly "java-runtime"
    And "java-runtime" is a declared capability
